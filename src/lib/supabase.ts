import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Position {
  id: string;
  title: string;
  description: string;
  must_skills: Array<{ skill: string; weight: number }>;
  nice_skills: Array<{ skill: string; weight: number }>;
  reject_keywords: string[];
  grade_thresholds: { A: number; B: number; C: number; D: number };
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Resume {
  id: string;
  position_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  upload_source: string;
  status: string;
  parse_error: string | null;
  created_at: string;
}

export interface Candidate {
  id: string;
  resume_id: string;
  position_id: string;
  name: string;
  phone: string;
  email: string;
  education: string;
  school: string;
  major: string;
  graduation_date: string | null;
  age: number | null;
  gender: string;
  work_years: number;
  skills: string[];
  projects: string[];
  highlights: string[];
  risks: string[];
  missing_fields: string[];
  raw_text: string;
  extraction_status: string;
  extraction_metadata: Record<string, any>;
  raw_text_source: string;
  japanese_level: string | null;
  willing_to_relocate: string | null;
  status: string;
  notes: string;
  resubmission_count: number;
  first_submitted_at: string;
  last_resubmitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CandidateStatus = 'new' | 'shortlisted' | 'interviewing' | 'hired' | 'rejected';

export interface CandidateResubmission {
  id: string;
  candidate_id: string;
  resume_id: string;
  position_id: string;
  resubmitted_at: string;
}

export interface Score {
  id: string;
  candidate_id: string;
  total_score: number;
  grade: string;
  must_score: number;
  nice_score: number;
  reject_penalty: number;
  scoring_details: Record<string, any>;
  explanation: string;
  matched_must: string[];
  matched_nice: string[];
  matched_reject: string[];
  missing_must: string[];
  created_at: string;
}

export interface EmailConfig {
  id: string;
  position_id: string;
  server: string;
  port: number;
  email: string;
  password: string;
  folder: string;
  search_keywords: string;
  last_sync_at: string | null;
  is_active: boolean;
  created_at: string;
}
