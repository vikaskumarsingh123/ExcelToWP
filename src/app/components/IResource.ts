export interface IResource {
  Title: string;
  Description: string;
  pdfUrl: string;
  wordURL: string;
  Status: number; //this keeps changing as the entry moves through the uploading stages
  batchId: string;
  id: string;
  Keywords: string;
  Year: number;
  Language: string;
  Pillar: string;
  WordpressLink: string; //This is the link we get from the wordpress API when we publish/POST the entry
  ErrorMesg: string; //The error returned by the API if something goes wrong. This is displayed as a tooltip in on the status icon.
}
