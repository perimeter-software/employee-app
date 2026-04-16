'use client';

// Full port of stadium-people's NewApplicantContext + useNewApplicant (424 lines).
// Notes / simplifications:
//   - Master/Admin branches are intentionally omitted per user instruction. isAdmin is fixed false.
//     stadium-people's handleUserSteps() removes the EMPLOYER_I_9 step for non-admins; we always
//     remove it.
//   - Toasts use `sonner` (already in employee-app) instead of notistack.
//   - Save goes through OnboardingService.updateApplicant (PUT /outside-protected/applicants/:id)
//     rather than the stadium-people updateApplicant action.
//   - The global currentApplicant mirror (AppContext.setCurrentApplicant) is not replicated; local
//     state is the source of truth inside onboarding.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { toast } from 'sonner';
import {
  APPLICANT_STEPS,
  ONBOARDING_STEPS,
  ONBOARDING_OBJECTS_ENUM,
  APPLICANT_OBJECTS_ENUM,
} from '../utils/constants';
import {
  createStateTaxFormSteps,
  type StateTaxFormStep,
} from '../utils/state-tax-forms';
import { getApplicantRequiredTaxStates } from '../utils/applicant-helpers';
import { useMinStageToOnboarding } from '../hooks/use-min-stage-to-onboarding';
import { OnboardingService } from '../services/onboarding-service';
import type {
  ApplicantRecord,
  CurrentFormState,
  NavButtonStates,
  NewApplicantState,
  OutsideMode,
  RegistrationStep,
} from '../types';

const DEFAULT_APPLICANT_SUB_STEP_ID = 3;
const DEFAULT_APPLICANT_SUB_STEP = ONBOARDING_OBJECTS_ENUM.UPLOAD;
const DEFAULT_APPLICANT_SUB_STEPS: string[] = [
  ONBOARDING_OBJECTS_ENUM.UPLOAD,
  ONBOARDING_OBJECTS_ENUM.W4_TAX,
];

// Maps URL `step` param → applicantObject key for the registration step list.
const URL_STEP_TO_APPLICANT_OBJECT: Record<string, string> = {
  overview: APPLICANT_OBJECTS_ENUM.OVERVIEW,
  info: APPLICANT_OBJECTS_ENUM.APPLICANT_INFO,
  resume: APPLICANT_OBJECTS_ENUM.RESUME_AND_JOB_HISTORY,
  recommended: APPLICANT_OBJECTS_ENUM.RECOMMENDED_JOBS,
  jobs: APPLICANT_OBJECTS_ENUM.JOB_APPLICANTS_AND_INTERVIEWS,
  interviews: APPLICANT_OBJECTS_ENUM.JOB_APPLICANTS_AND_INTERVIEWS,
  additional: APPLICANT_OBJECTS_ENUM.ADDITIONAL_FORMS,
};

const initialState: NewApplicantState = {
  applicant: {},
  registrationSteps: [],
  registrationSubSteps: ONBOARDING_STEPS.filter((s) =>
    DEFAULT_APPLICANT_SUB_STEPS.includes(s.applicantObject)
  ),
  activeStepId: 0,
  activeStep: '',
  activeSubStepId: DEFAULT_APPLICANT_SUB_STEP_ID,
  activeSubStep: DEFAULT_APPLICANT_SUB_STEP,
  onboardingProgressId: 1,
  error: {},
  buttonState: {
    submit: { show: false, disabled: true },
    previous: { show: false, disabled: true },
    next: { show: false, disabled: true },
  },
  currentFormState: {},
};

type Action =
  | { type: 'SET_REGISTRATION_STEP'; data: { activeStepId: number; step: string } }
  | { type: 'SET_REGISTRATION_SUB_STEP'; data: { activeStepId: number; step: string } }
  | { type: 'CREATE_APPLICANT'; data: Partial<ApplicantRecord> }
  | { type: 'UPDATE_APPLICANT'; data: Partial<ApplicantRecord> }
  | { type: 'UPDATE_APPLICANT_ERROR'; error: Record<string, unknown> }
  | { type: 'UPDATE_BUTTONS'; buttonState: Partial<NavButtonStates> }
  | { type: 'UPDATE_FORM_STATE'; currentFormState: Partial<CurrentFormState> }
  | { type: 'SET_REGISTRATION_STEPS'; data: RegistrationStep[] }
  | { type: 'SET_REGISTRATION_SUB_STEPS'; data: RegistrationStep[] }
  | { type: 'SET_APPLICANT'; data: ApplicantRecord }
  | { type: 'SET_ONBOARDING_PROGRESS'; data: number };

function reducer(state: NewApplicantState, action: Action): NewApplicantState {
  switch (action.type) {
    case 'SET_REGISTRATION_STEP':
      return { ...state, activeStepId: action.data.activeStepId, activeStep: action.data.step };
    case 'SET_REGISTRATION_SUB_STEP':
      return { ...state, activeSubStepId: action.data.activeStepId, activeSubStep: action.data.step };
    case 'CREATE_APPLICANT':
      return { ...state, applicant: { ...state.applicant, ...action.data } };
    case 'UPDATE_APPLICANT':
      return { ...state, applicant: { ...state.applicant, ...action.data }, error: {} };
    case 'UPDATE_APPLICANT_ERROR':
      return { ...state, error: action.error };
    case 'UPDATE_BUTTONS':
      return {
        ...state,
        buttonState: { ...state.buttonState, ...action.buttonState } as NavButtonStates,
      };
    case 'UPDATE_FORM_STATE':
      return {
        ...state,
        currentFormState: { ...state.currentFormState, ...action.currentFormState },
      };
    case 'SET_REGISTRATION_STEPS':
      return { ...state, registrationSteps: action.data };
    case 'SET_REGISTRATION_SUB_STEPS':
      return { ...state, registrationSubSteps: action.data };
    case 'SET_APPLICANT':
      return { ...state, applicant: action.data };
    case 'SET_ONBOARDING_PROGRESS':
      return { ...state, onboardingProgressId: action.data };
    default:
      return state;
  }
}

export interface NewApplicantContextValue extends NewApplicantState {
  outsideMode: OutsideMode;
  isOnboardingComplete: boolean;
  // State setters
  setApplicant: (a: ApplicantRecord) => void;
  setActiveStep: (stepId: number) => void;
  setActiveSubStep: (stepId: number) => void;
  setRegistrationSteps: (steps: RegistrationStep[]) => void;
  setRegistrationSubSteps: (steps: RegistrationStep[]) => void;
  updateButtons: (patch: Partial<NavButtonStates>) => void;
  updateCurrentFormState: (patch: Partial<CurrentFormState>) => void;
  // Aliases kept for FormContainer parity with stadium-people
  setButtonState: (patch: Partial<NavButtonStates>) => void;
  setCurrentFormState: (patch: Partial<CurrentFormState>) => void;
  // Navigation
  onNextStep: () => void;
  onPreviousStep: () => void;
  onNextSubStep: () => void;
  onPreviousSubStep: () => void;
  getActiveRegistrationStep: () => RegistrationStep | undefined;
  getActiveRegistrationSubStep: () => RegistrationStep | undefined;
  getFirstAndLastRegistrationSubSteps: () => [
    RegistrationStep | undefined,
    RegistrationStep | undefined,
  ];
  // Applicant load + save
  loadApplicantAction: (data: Partial<ApplicantRecord>, silent?: boolean) => void;
  updateApplicantAction: (
    applicantId: string,
    data: Partial<ApplicantRecord>,
    skipLocalUpdate?: boolean
  ) => Promise<Partial<ApplicantRecord>>;
  setApplicantSteps: (
    status?: string,
    applicantStatus?: string,
    acknowledged?: boolean | { date?: string } | undefined,
    forceRefreshSteps?: boolean,
    initialStep?: string
  ) => void;
  submitRef: MutableRefObject<null | (() => Promise<void> | void)>;
}

const NewApplicantContext = createContext<NewApplicantContextValue | null>(null);

interface ProviderProps {
  outsideMode?: OutsideMode;
  venues?: Record<string, { state?: string } | undefined> | null;
  children: React.ReactNode;
}

export const NewApplicantContextProvider: React.FC<ProviderProps> = ({
  outsideMode = '',
  venues,
  children,
}) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { allowedStages } = useMinStageToOnboarding();

  // Track intent: after setApplicantSteps bumps `stepsRefreshed`, the effect below
  // snaps the user to the requested step (from URL) or to step 1.
  const [stepsRefreshed, setStepsRefreshed] = useState(0);
  const [stepToGo, setStepToGo] = useState<string | null>(null);

  const submitRef: MutableRefObject<null | (() => Promise<void> | void)> = useRef(null);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const isOnboardingComplete = useMemo(() => {
    const ack = state.applicant?.acknowledged as boolean | { date?: string } | undefined;
    if (typeof ack === 'object') return !!ack?.date;
    return !!ack;
  }, [state.applicant?.acknowledged]);

  // ---------- State mutators ----------
  const setApplicant = useCallback(
    (a: ApplicantRecord) => dispatch({ type: 'SET_APPLICANT', data: a }),
    []
  );
  const setRegistrationSteps = useCallback(
    (data: RegistrationStep[]) => dispatch({ type: 'SET_REGISTRATION_STEPS', data }),
    []
  );
  const setRegistrationSubSteps = useCallback(
    (data: RegistrationStep[]) => dispatch({ type: 'SET_REGISTRATION_SUB_STEPS', data }),
    []
  );
  const updateButtons = useCallback(
    (patch: Partial<NavButtonStates>) =>
      dispatch({ type: 'UPDATE_BUTTONS', buttonState: patch }),
    []
  );
  const updateCurrentFormState = useCallback(
    (patch: Partial<CurrentFormState>) =>
      dispatch({ type: 'UPDATE_FORM_STATE', currentFormState: patch }),
    []
  );

  // ---------- Navigation ----------
  const onNextStep = useCallback(() => {
    const len = stateRef.current.registrationSteps.length;
    const activeStepId =
      stateRef.current.activeStepId >= len ? len : stateRef.current.activeStepId + 1;
    const step = stateRef.current.registrationSteps[activeStepId - 1];
    if (!step) return;
    dispatch({
      type: 'SET_REGISTRATION_SUB_STEP',
      data: { activeStepId: DEFAULT_APPLICANT_SUB_STEP_ID, step: DEFAULT_APPLICANT_SUB_STEP },
    });
    dispatch({
      type: 'SET_REGISTRATION_STEP',
      data: { activeStepId, step: step.applicantObject },
    });
  }, []);

  const onPreviousStep = useCallback(() => {
    const activeStepId = stateRef.current.activeStepId <= 1 ? 1 : stateRef.current.activeStepId - 1;
    const step = stateRef.current.registrationSteps[activeStepId - 1];
    if (!step) return;
    dispatch({
      type: 'SET_REGISTRATION_SUB_STEP',
      data: { activeStepId: DEFAULT_APPLICANT_SUB_STEP_ID, step: DEFAULT_APPLICANT_SUB_STEP },
    });
    dispatch({
      type: 'SET_REGISTRATION_STEP',
      data: { activeStepId, step: step.applicantObject },
    });
  }, []);

  const onNextSubStep = useCallback(() => {
    const subs = stateRef.current.registrationSubSteps;
    const idx = subs.findIndex((s) => s.id === stateRef.current.activeSubStepId);
    const step = subs[Math.min(idx + 1, subs.length - 1)];
    if (!step) return;
    dispatch({
      type: 'SET_REGISTRATION_SUB_STEP',
      data: { activeStepId: step.id, step: step.applicantObject },
    });
  }, []);

  const onPreviousSubStep = useCallback(() => {
    const subs = stateRef.current.registrationSubSteps;
    const idx = subs.findIndex((s) => s.id === stateRef.current.activeSubStepId);
    const step = subs[Math.max(idx - 1, 0)];
    if (!step) return;
    dispatch({
      type: 'SET_REGISTRATION_SUB_STEP',
      data: { activeStepId: step.id, step: step.applicantObject },
    });
  }, []);

  const setActiveStep = useCallback((stepId: number) => {
    const step = stateRef.current.registrationSteps[stepId - 1];
    if (!step) return;
    dispatch({
      type: 'SET_REGISTRATION_SUB_STEP',
      data: { activeStepId: DEFAULT_APPLICANT_SUB_STEP_ID, step: DEFAULT_APPLICANT_SUB_STEP },
    });
    dispatch({
      type: 'SET_REGISTRATION_STEP',
      data: { activeStepId: stepId, step: step.applicantObject },
    });
  }, []);

  const setActiveSubStep = useCallback((stepId: number) => {
    const subs = stateRef.current.registrationSubSteps;
    const step = subs.find((s) => s.id === stepId);
    if (!step) return;
    dispatch({
      type: 'SET_REGISTRATION_SUB_STEP',
      data: { activeStepId: stepId, step: step.applicantObject },
    });
  }, []);

  const getActiveRegistrationStep = useCallback(
    () => state.registrationSteps.find((s) => s.id === state.activeStepId),
    [state.registrationSteps, state.activeStepId]
  );
  const getActiveRegistrationSubStep = useCallback(
    () => state.registrationSubSteps.find((s) => s.id === state.activeSubStepId),
    [state.registrationSubSteps, state.activeSubStepId]
  );
  const getFirstAndLastRegistrationSubSteps = useCallback((): [
    RegistrationStep | undefined,
    RegistrationStep | undefined,
  ] => {
    const s = state.registrationSubSteps;
    return [s[0], s[s.length - 1]];
  }, [state.registrationSubSteps]);

  // ---------- Step set resolution ----------
  // Remove EMPLOYER_I_9 always (stadium-people only showed it to Master/Admin, which we skip).
  const stripEmployerI9 = useCallback((steps: RegistrationStep[]) => {
    return steps
      .filter((s) => s.applicantObject !== ONBOARDING_OBJECTS_ENUM.EMPLOYER_I_9)
      .map((s, i) => ({ ...s, id: i + 1 }));
  }, []);

  // Mirror stadium-people's adjustRegistrationSteps: when the applicant has required
  // tax states, splice dynamic state tax form sub-steps after W-4.
  const adjustedStepsFor = useCallback(
    (baseSteps: RegistrationStep[], applicant: ApplicantRecord) => {
      const requiredStates = getApplicantRequiredTaxStates(applicant, venues ?? null);
      if (!requiredStates.length) return baseSteps;

      const w4Idx = baseSteps.findIndex(
        (s) => s.applicantObject === ONBOARDING_OBJECTS_ENUM.W4_TAX
      );
      if (w4Idx < 0) return baseSteps;

      const taxSteps = createStateTaxFormSteps(requiredStates);
      const next: RegistrationStep[] = [...baseSteps];
      let insertAt = w4Idx + 1;
      taxSteps.forEach((ts: StateTaxFormStep) => {
        const already = next.findIndex((s) => s.applicantObject === ts.applicantObject) >= 0;
        if (!already) {
          next.splice(insertAt, 0, ts);
          insertAt += 1;
        }
      });
      return next.map((s, i) => ({ ...s, id: i + 1 }));
    },
    [venues]
  );

  const setApplicantSteps = useCallback(
    (
      _status?: string,
      applicantStatus?: string,
      acknowledged?: boolean | { date?: string } | undefined,
      forceRefreshSteps?: boolean,
      initialStep?: string
    ) => {
      const ackBool = typeof acknowledged === 'object' ? !!acknowledged?.date : !!acknowledged;
      // stadium-people: if allowedStages.includes(applicantStatus) && !acknowledged (or admin),
      // show ONBOARDING_STEPS; otherwise show APPLICANT_STEPS.
      const showOnboarding =
        allowedStages.includes(applicantStatus ?? '') && !ackBool;
      const base = showOnboarding ? ONBOARDING_STEPS : APPLICANT_STEPS;
      dispatch({ type: 'SET_REGISTRATION_STEPS', data: stripEmployerI9(base) });

      dispatch({
        type: 'SET_REGISTRATION_SUB_STEPS',
        data: ONBOARDING_STEPS.filter((s) =>
          DEFAULT_APPLICANT_SUB_STEPS.includes(s.applicantObject)
        ),
      });

      // Default start: onboarding → first step (Job Application); pre-onboarding → Contact Info.
      // A URL step param overrides the default.
      const defaultStart = showOnboarding
        ? ONBOARDING_OBJECTS_ENUM.JOB_APPLICATION
        : APPLICANT_OBJECTS_ENUM.APPLICANT_INFO;
      setStepToGo(
        (initialStep && URL_STEP_TO_APPLICANT_OBJECT[initialStep]) || defaultStart
      );
      setStepsRefreshed((p) => (!p || forceRefreshSteps ? p + 1 : p));
    },
    [allowedStages, stripEmployerI9]
  );

  // ---------- Load + save ----------
  const loadApplicantAction = useCallback(
    (data: Partial<ApplicantRecord>, silent?: boolean) => {
      if (!silent) toast.success('Applicant info loaded.');
      dispatch({ type: 'UPDATE_APPLICANT', data });
    },
    []
  );

  const updateApplicantAction = useCallback(
    async (
      applicantId: string,
      data: Partial<ApplicantRecord>,
      skipLocalUpdate?: boolean
    ): Promise<Partial<ApplicantRecord>> => {
      try {
        const res = (await OnboardingService.updateApplicant(applicantId, data)) as
          | (Partial<ApplicantRecord> & {
              acknowledged?: boolean;
              updatedApplicant?: Partial<ApplicantRecord>;
            })
          | undefined;

        if (res?.acknowledged) {
          toast.success('Applicant info saved.');
          if (!skipLocalUpdate) {
            dispatch({ type: 'UPDATE_APPLICANT', data });
            if (res.updatedApplicant) {
              dispatch({ type: 'UPDATE_APPLICANT', data: res.updatedApplicant });
            }
          }
        } else {
          toast.error(
            'An error has occurred. Please try refreshing the page and re-verifying.'
          );
          dispatch({
            type: 'UPDATE_APPLICANT_ERROR',
            error: { message: 'Update failed.' },
          });
        }
        return data;
      } catch (err: unknown) {
        const e = err as { response?: { status?: number }; message?: string };
        if (e?.response?.status === 401) {
          toast.error('Session expired.');
          window.location.reload();
          throw err;
        }
        toast.error('An error has occurred. Please try refreshing the page and re-verifying.');
        throw err;
      }
    },
    []
  );

  // ---------- Effects: dynamic step splicing + auto-navigate after refresh ----------
  useEffect(() => {
    // Re-adjust steps when applicant data or venues change (state tax forms splicing).
    const base = state.registrationSteps;
    if (!base.length || !state.applicant || !Object.keys(state.applicant).length) return;
    const next = adjustedStepsFor(base, state.applicant);
    if (next.length !== base.length) {
      dispatch({ type: 'SET_REGISTRATION_STEPS', data: next });
    }
  }, [state.applicant, state.registrationSteps, adjustedStepsFor]);

  useEffect(() => {
    // Mirror stadium-people setApplicantProgress: highest step id the applicant has data for.
    let id = 0;
    state.registrationSteps.forEach((s, i) => {
      if (state.applicant && Object.prototype.hasOwnProperty.call(state.applicant, s.applicantObject)) {
        id = i;
      }
    });
    dispatch({ type: 'SET_ONBOARDING_PROGRESS', data: id });
  }, [state.registrationSteps, state.applicant]);

  useEffect(() => {
    if (!stepsRefreshed) return;
    if (stepToGo) {
      const idx = state.registrationSteps.findIndex((s) => s.applicantObject === stepToGo);
      if (idx >= 0) {
        setActiveStep(idx + 1);
        setActiveSubStep(DEFAULT_APPLICANT_SUB_STEP_ID);
        setStepToGo(null);
        return;
      }
    }
    setActiveStep(1);
    setActiveSubStep(DEFAULT_APPLICANT_SUB_STEP_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsRefreshed]);

  const value = useMemo<NewApplicantContextValue>(
    () => ({
      ...state,
      outsideMode,
      isOnboardingComplete,
      setApplicant,
      setActiveStep,
      setActiveSubStep,
      setRegistrationSteps,
      setRegistrationSubSteps,
      updateButtons,
      updateCurrentFormState,
      setButtonState: updateButtons,
      setCurrentFormState: updateCurrentFormState,
      onNextStep,
      onPreviousStep,
      onNextSubStep,
      onPreviousSubStep,
      getActiveRegistrationStep,
      getActiveRegistrationSubStep,
      getFirstAndLastRegistrationSubSteps,
      loadApplicantAction,
      updateApplicantAction,
      setApplicantSteps,
      submitRef,
    }),
    [
      state,
      outsideMode,
      isOnboardingComplete,
      setApplicant,
      setActiveStep,
      setActiveSubStep,
      setRegistrationSteps,
      setRegistrationSubSteps,
      updateButtons,
      updateCurrentFormState,
      onNextStep,
      onPreviousStep,
      onNextSubStep,
      onPreviousSubStep,
      getActiveRegistrationStep,
      getActiveRegistrationSubStep,
      getFirstAndLastRegistrationSubSteps,
      loadApplicantAction,
      updateApplicantAction,
      setApplicantSteps,
    ]
  );

  return (
    <NewApplicantContext.Provider value={value}>{children}</NewApplicantContext.Provider>
  );
};

export function useNewApplicantContext(): NewApplicantContextValue {
  const ctx = useContext(NewApplicantContext);
  if (!ctx)
    throw new Error('useNewApplicantContext must be used inside NewApplicantContextProvider');
  return ctx;
}

export { APPLICANT_OBJECTS_ENUM, ONBOARDING_OBJECTS_ENUM };
