export interface User {
  id: number;
  name: string;
  email: string;
  role: "school" | "university";
  university_id: number | null;
}
export interface University {
  id: number;
  name: string;
  region: string;
  profile: string;
  accreditation: string;
  owner_id: number;
  details: Record<string, string>;
  editable: boolean;
}
export interface Program {
  id: number;
  name: string;
  direction: string;
  competencies: string;
  tools: string;
}
export interface Task {
  id: number;
  deal_id: number;
  owner_id: number;
  title: string;
  due: string;
  status: string;
  audience: string;
  deal_title?: string;
  editable?: boolean;
}
export interface Group {
  id: number;
  deal_id: number;
  name: string;
  confirmed: boolean;
  started: boolean;
  students: number;
  progress: number;
  attendance: number;
  completed: number;
  results: number;
  source: string;
}
export interface Proposal {
  id: number;
  version: number;
  content: string;
  status: string;
  comment: string;
}
export interface Activity {
  id: number;
  kind: string;
  text: string;
  shared: boolean;
  created_at: string;
  edited: boolean;
  mine: boolean;
  author_initials: string;
}
export interface Document {
  id: number;
  name: string;
  kind: string;
  version: number;
}
export interface Expansion {
  id: number;
  text: string;
  status: string;
  new_deal_id: number | null;
}
export interface Deal {
  id: number;
  university_id: number;
  program_id: number;
  owner_id?: number;
  title: string;
  university_name: string;
  program_name: string;
  stage: string;
  stage_label: string;
  deadline: string;
  qualification?: Record<string, string>;
  preparation: Record<string, string>;
  notes?: string;
  parent_id: number | null;
  proposal_status: string;
  groups: Group[];
  proposals?: Proposal[];
  activities?: Activity[];
  documents?: Document[];
  tasks?: Task[];
  expansions?: Expansion[];
  created_at: string;
}
export interface Participant {
  id: number;
  name: string;
  email: string;
  phone: string;
  kind: string;
  result: {
    progress: number;
    attendance: number;
    score: number;
    source: string;
  } | null;
}
export interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  position: string;
}
export interface Report {
  total: number;
  overdue: number;
  conversion: number;
  conversion_definition: string;
  average_days: number;
  students: number;
  stages: Record<string, number>;
}
export interface Notification {
  id: number;
  text: string;
  deal_id: number | null;
  read: boolean;
  created_at: string;
}
export interface Job {
  id: number;
  kind: string;
  status: string;
  error: string;
  attempts: number;
  created_at: string;
}
export interface ImportPreview {
  rows: Array<{
    row: number;
    name: string;
    email: string;
    phone: string;
    action: string;
  }>;
  errors: Array<{ row: number; message: string }>;
  ignored_columns: string[];
  created: number;
  committed: boolean;
}
