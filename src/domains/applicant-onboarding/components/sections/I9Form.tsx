'use client';

// Structural port of stadium-people I9Form + SignatureModal. Full source collects
// Section 1 of USCIS Form I-9 with signature. This port wires the primary fields
// and a typed-name signature; replace with canvas signature component later.
import { Controller } from 'react-hook-form';
import { StepScaffold, SimpleField, StubBanner } from './_StepScaffold';
import { Input } from '@/components/ui/Input';
import { useNewApplicantContext } from '../../state/new-applicant-context';

interface Values {
  lastName: string;
  firstName: string;
  middleInitial: string;
  otherNames: string;
  address: string;
  apt: string;
  city: string;
  state: string;
  zip: string;
  dateOfBirth: string;
  ssn: string;
  email: string;
  phone: string;
  citizenshipStatus: string;
  alienNumber: string;
  i94Number: string;
  passportNumber: string;
  workAuthExpiration: string;
  signature: string;
  signatureDate: string;
}

const I9Form: React.FC = () => {
  const { applicant } = useNewApplicantContext();
  const existing = (applicant?.i9Form as Record<string, unknown> | undefined) ?? {};

  return (
    <StepScaffold<Values>
      title="U.S. I-9 Form"
      description="Section 1 — Employee Information and Attestation"
      defaultValues={{
        lastName: (existing.lastName as string) ?? (applicant?.lastName as string) ?? '',
        firstName: (existing.firstName as string) ?? (applicant?.firstName as string) ?? '',
        middleInitial: (existing.middleInitial as string) ?? '',
        otherNames: (existing.otherNames as string) ?? '',
        address: (existing.address as string) ?? (applicant?.address1 as string) ?? '',
        apt: (existing.apt as string) ?? '',
        city: (existing.city as string) ?? (applicant?.city as string) ?? '',
        state: (existing.state as string) ?? (applicant?.state as string) ?? '',
        zip: (existing.zip as string) ?? (applicant?.zip as string) ?? '',
        dateOfBirth: (existing.dateOfBirth as string) ?? '',
        ssn: (existing.ssn as string) ?? '',
        email: (existing.email as string) ?? (applicant?.email as string) ?? '',
        phone: (existing.phone as string) ?? (applicant?.phone as string) ?? '',
        citizenshipStatus: (existing.citizenshipStatus as string) ?? '',
        alienNumber: (existing.alienNumber as string) ?? '',
        i94Number: (existing.i94Number as string) ?? '',
        passportNumber: (existing.passportNumber as string) ?? '',
        workAuthExpiration: (existing.workAuthExpiration as string) ?? '',
        signature: (existing.signature as string) ?? '',
        signatureDate: (existing.signatureDate as string) ?? '',
      }}
      toPayload={(v) => ({ i9Form: v })}
    >
      {({ control }) => (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StubBanner note="Canvas signature pad + document validation pending. Signature here is a typed name." />
          {(
            [
              ['lastName', 'Last Name'],
              ['firstName', 'First Name'],
              ['middleInitial', 'Middle Initial'],
              ['otherNames', 'Other Last Names Used'],
              ['address', 'Address'],
              ['apt', 'Apt #'],
              ['city', 'City'],
              ['state', 'State'],
              ['zip', 'Zip'],
              ['dateOfBirth', 'Date of Birth (MM/DD/YYYY)'],
              ['ssn', 'SSN'],
              ['email', 'Email'],
              ['phone', 'Phone'],
              ['citizenshipStatus', 'Citizenship Status'],
              ['alienNumber', 'Alien Reg. #'],
              ['i94Number', 'Form I-94 #'],
              ['passportNumber', 'Passport #'],
              ['workAuthExpiration', 'Work Auth. Expiration'],
              ['signature', 'Signature (type full name)'],
              ['signatureDate', 'Signature Date'],
            ] as [keyof Values, string][]
          ).map(([name, label]) => (
            <Controller
              key={name}
              name={name}
              control={control}
              render={({ field }) => (
                <SimpleField label={label}>
                  <Input {...field} />
                </SimpleField>
              )}
            />
          ))}
        </div>
      )}
    </StepScaffold>
  );
};

export default I9Form;
