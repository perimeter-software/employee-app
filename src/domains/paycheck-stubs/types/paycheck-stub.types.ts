export interface PaycheckStub {
  _id: string;
  batchId: string;
  applicantId: string;
  employeeID: string;
  voucherNumber: string;
  checkDate: string;
  fileName: string;
  viewStatus: 'viewed' | 'unviewed';
  fileUrl: string;
  uploadedAt: string;
}

export interface PaycheckStubsResponse {
  paycheckStubs: PaycheckStub[];
  count?: number;
}

