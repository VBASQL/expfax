// FaxBack API response types (parsed from XML)

export interface FaxBackQueueEntry {
  Handle: string;
  AccountGuid: string;
  AccountId: string;
  StatusNum: number;
  Queue: number;
}

export interface FaxBackMessageDetail {
  Handle: string;
  AccountGuid: string;
  AccountId: string;
  Subject: string;
  SenderName: string;
  SenderCompany: string;
  SenderFaxNumber: string;
  SenderVoiceNumber: string;
  CoverTemplate: string;
  AppInfo: string;
  BillingCode: string;
  Resolution: number;
  SubmitTime: string;
  ScheduleTime: string;
  StatusNum: number;
  Queue: number;
  Recipients: FaxBackRecipient[];
  Documents: FaxBackDocument[];
}

export interface FaxBackRecipient {
  RecipientGuid: string;
  Name: string;
  FaxNumber: string;
  OriginalAddress: string;
  Prefix: number;
  Status: string;
  Error: string;
  ErrorNumber: number;
  StartTime: string;
  DialSeconds: number;
  ConnectSeconds: number;
  TotalSeconds: number;
  PageCount: number;
  PagesTransferred: number;
  ConnectBPS: number;
  Retries: number;
  LocalCSID: string;
  RemoteCSID: string;
}

export interface FaxBackDocument {
  DocumentGuid: string;
  DocumentPart: number;
  Name: string;
  DocumentType: number;
  PageCount: number;
}

export interface FaxBackQueueCounts {
  Received: number;
  Send: number;
  Sending: number;
  Sent: number;
  SentPendingDeletion: number;
  Receiving: number;
  ReceivedPendingDeletion: number;
  Failed: number;
}

export interface SendMessageParams {
  accountGuid: string;
  subject?: string;
  senderName?: string;
  senderCompany?: string;
  senderFaxNumber?: string;
  senderVoiceNumber?: string;
  coverTemplate?: string;
  coverMessage?: string;
  billingCode?: string;
  resolution?: number;
  scheduleTime?: string;
  recipients: { name: string; faxNumber: string; prefix?: number }[];
  documents: { name: string; contentBase64: string; documentType?: number }[];
}
