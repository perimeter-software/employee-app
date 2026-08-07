'use client';

import { useEffect, useMemo, useState } from 'react';
import { NextPage } from 'next';
import { User, Mail, MapPin, Briefcase, ShieldCheck, Save, X } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { useAppUser } from '@/domains/user/hooks/useAppUser';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import {
  useProfile,
  useUpdateProfile,
  useIdentityStatus,
  useSubmitIdentity,
  useRemoveIdentity,
  type ProfilePatch,
} from '@/domains/user/hooks/use-profile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Toggle } from '@/components/ui/Toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';

// Mirrors the editable half of ProfileRecord: names live on the users doc, the
// rest on the linked applicant. Field names match the applicant doc.
type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  altPhone: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
};

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  phone: '',
  altPhone: '',
  address1: '',
  city: '',
  state: '',
  zip: '',
};

const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

function SectionCard({
  icon: Icon,
  iconColor,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-3 text-sm">
          <span className={`h-8 w-8 rounded-md flex items-center justify-center ${iconColor}`}>
            <Icon className="h-4 w-4 text-white" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-500">{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder ?? label}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-500">{label}</Label>
      <p className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
        {value || '—'}
      </p>
    </div>
  );
}

const ProfilePage: NextPage = () => {
  const { user, error: authError, isLoading: authLoading } = useAppUser();
  const { shouldShowContent, isLoading: pageAuthLoading, error: pageAuthError } =
    usePageAuth({ requireAuth: true });
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  const isMaster =
    profile?.userType === 'Master' || profile?.userType === 'Admin';

  const identityStatusQuery = useIdentityStatus(!!isMaster);
  const submitIdentity = useSubmitIdentity();
  const removeIdentity = useRemoveIdentity();
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [initial, setInitial] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (!profile) return;
    const next: FormState = {
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      phone: profile.phone ?? '',
      altPhone: profile.altPhone ?? '',
      address1: profile.address1 ?? '',
      city: profile.city ?? '',
      state: profile.state ?? '',
      zip: profile.zip ?? '',
    };
    setForm(next);
    setInitial(next);
  }, [profile]);

  const isDirty = useMemo(
    () =>
      (Object.keys(form) as Array<keyof FormState>).some(
        (k) => form[k] !== initial[k],
      ),
    [form, initial],
  );

  const setField = (k: keyof FormState) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!isDirty) return;
    const patch: ProfilePatch = {};
    (Object.keys(form) as Array<keyof FormState>).forEach((k) => {
      if (form[k] !== initial[k]) patch[k] = form[k] === '' ? null : form[k];
    });
    updateProfile.mutate(patch, { onSuccess: () => setInitial(form) });
  };

  const sesStatus = identityStatusQuery.data ?? 'none';
  const isVerified = sesStatus === 'verified' || sesStatus === 'submitted';
  const identityBusy =
    submitIdentity.isPending ||
    removeIdentity.isPending ||
    identityStatusQuery.isLoading;

  const handleIdentityToggle = () => {
    if (identityBusy) return;
    if (isVerified) setConfirmRemoveOpen(true);
    else submitIdentity.mutate();
  };

  // ── auth / loading gates (mirrors dashboard page) ──
  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
          <p className="text-gray-600 font-medium">Loading your profile…</p>
        </div>
      </div>
    );
  }
  if (pageAuthLoading) return <AuthLoadingState />;
  if (pageAuthError || authError) {
    const msg =
      pageAuthError?.message ||
      (authError as { message?: string })?.message ||
      'Authentication error';
    return <AuthErrorState error={msg} />;
  }
  if (!user || !shouldShowContent) return <UnauthenticatedState />;

  const fullName = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();
  const initials = `${profile?.firstName?.[0] ?? ''}${profile?.lastName?.[0] ?? ''}`.toUpperCase();
  const statusLabel: Record<string, string> = {
    verified: 'Verified',
    submitted: 'Pending verification',
    unsubmitted: 'Not submitted',
    none: 'Not submitted',
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-5 pb-10">
        {/* Header */}
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-4 min-w-0">
              <Avatar className="h-16 w-16">
                {profile?.profileImg && (
                  <AvatarImage src={profile.profileImg} alt={fullName} />
                )}
                <AvatarFallback className="bg-blue-100 text-blue-700 text-lg font-semibold">
                  {initials || <User className="h-6 w-6" />}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-900 truncate">
                  {fullName || 'My Profile'}
                </h1>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  {profile?.userType || 'User'}
                </p>
                <p className="text-sm text-slate-500 truncate">
                  {profile?.emailAddress}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={() => setForm(initial)}
                disabled={!isDirty || updateProfile.isPending}
                leftIcon={<X className="h-4 w-4" />}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!isDirty || updateProfile.isPending}
                loading={updateProfile.isPending}
                leftIcon={<Save className="h-4 w-4" />}
              >
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Personal */}
        <SectionCard icon={User} iconColor="bg-blue-600" title="Personal Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="First Name" value={form.firstName} onChange={setField('firstName')} />
            <Field label="Last Name" value={form.lastName} onChange={setField('lastName')} />
          </div>
        </SectionCard>

        {/* Contact */}
        <SectionCard icon={Mail} iconColor="bg-emerald-600" title="Contact Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReadOnlyField label="Email" value={profile?.emailAddress ?? ''} />
            <Field label="Phone" value={form.phone} onChange={setField('phone')} />
            <Field label="Alternate Phone" value={form.altPhone} onChange={setField('altPhone')} />
          </div>
        </SectionCard>

        {/* Address */}
        <SectionCard icon={MapPin} iconColor="bg-orange-600" title="Address">
          <div className="space-y-4">
            <Field label="Address" value={form.address1} onChange={setField('address1')} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="City" value={form.city} onChange={setField('city')} />
              <Field label="State" value={form.state} onChange={setField('state')} />
              <Field label="Zip Code" value={form.zip} onChange={setField('zip')} />
            </div>
          </div>
        </SectionCard>

        {/* Employment (read-only) */}
        <SectionCard icon={Briefcase} iconColor="bg-purple-600" title="Employment">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReadOnlyField label="Status" value={profile?.status ?? ''} />
            <ReadOnlyField label="Employment Status" value={profile?.employmentStatus ?? ''} />
            <ReadOnlyField label="Employment Type" value={profile?.employmentType ?? ''} />
            <ReadOnlyField label="Hire Date" value={fmtDate(profile?.hireDate)} />
            {/* users-doc role — usually unset, so only shown when populated. */}
            {profile?.employeeType && (
              <ReadOnlyField label="Employee Type" value={profile.employeeType} />
            )}
            {(profile?.startDate || profile?.endDate) && (
              <>
                <ReadOnlyField label="Start Date" value={fmtDate(profile?.startDate)} />
                <ReadOnlyField label="End Date" value={fmtDate(profile?.endDate)} />
              </>
            )}
          </div>
        </SectionCard>

        {/* Identity Verification — Master/Admin only (matches legacy gating) */}
        {isMaster && (
          <SectionCard icon={ShieldCheck} iconColor="bg-teal-600" title="Identity Verification">
            <p className="text-sm text-slate-500 mb-4">
              Verify your email as a sender identity so the platform can send
              mail on its behalf. Turning this on emails a verification request
              to{' '}
              <span className="font-medium text-slate-700">
                {profile?.emailAddress}
              </span>
              .
            </p>
            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-800">Identity Verified</span>
                <span
                  className={
                    sesStatus === 'verified'
                      ? 'text-xs text-emerald-600'
                      : sesStatus === 'submitted'
                        ? 'text-xs text-amber-600'
                        : 'text-xs text-slate-400'
                  }
                >
                  {identityStatusQuery.isLoading ? 'Checking…' : statusLabel[sesStatus]}
                </span>
              </div>
              <Toggle
                variant="outline"
                pressed={isVerified}
                disabled={identityBusy}
                onPressedChange={handleIdentityToggle}
                aria-label="Toggle identity verification"
              >
                {isVerified ? 'On' : 'Off'}
              </Toggle>
            </div>
          </SectionCard>
        )}
      </div>

      <Dialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove identity verification?</DialogTitle>
            <DialogDescription>
              This sets {profile?.emailAddress} back to unsubmitted and removes
              it as a verified SES sender identity. You&apos;ll need to re-verify
              to send mail as this address again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmRemoveOpen(false)}
              disabled={removeIdentity.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={removeIdentity.isPending}
              onClick={() =>
                removeIdentity.mutate(undefined, {
                  onSuccess: () => setConfirmRemoveOpen(false),
                })
              }
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default ProfilePage;
