import type { EnrollmentStatus } from '@/lib/enrollment-status';

export type EnrollmentChildRow = {
  id: string;
  requestId: string;
  firstName: string;
  lastName: string;
  confirmed: boolean;
  status: EnrollmentStatus;
  childAccessLevel?: EnrollmentStatus;
  birthDate: string | null;
  preferredLocation: string | null;
  preferredLocationId?: string | null;
  notes: string | null;
  proposedGroupId: string | null;
  proposedAt: string | null;
};

export type EnrollmentParentRow = {
  id: string;
  parentUserId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  accessLevel: EnrollmentStatus;
  discountLargeFamily?: boolean;
  children: EnrollmentChildRow[];
};

export type EnrollmentGroupRow = {
  id: string;
  name: string;
  location_name: string;
  schedule: string;
  location_ids?: string[];
  price_monthly?: string | number | null;
  price_yearly?: string | number | null;
};

export type ComplimentaryParentRow = {
  id: string;
  source: 'USER' | 'ENROLLMENT';
  parentId: string | null;
  parentEmail: string | null;
  firstName: string;
  lastName: string;
  email: string;
};
