// schema.sql 기준 최소 타입 정의 (전체 컬럼을 다루진 않고, 프론트에서 쓰는 형태만 정의)

export type SpaceLocation = {
  lat: number;
  lng: number;
  address?: string;
};

export type Category = {
  id: string;
  name: string;
  created_by: string | null;
  canonical_id: string | null;
  status: "active" | "merged";
  created_at: string;
};

export type Space = {
  id: string;
  category_id: string;
  location: SpaceLocation;
  managed_by: "official" | "personal";
  owner_id: string | null;
  details: Record<string, unknown>;
  recurring_groups: unknown[];
  verified: boolean;
  shared: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Submission = {
  id: string;
  space_id: string;
  submitted_by: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
};

export type MonthlyRegistrationUsage = {
  id: string;
  user_id: string;
  month: string;
  registration_count: number;
  plan_tier: "free" | "basic" | "pro";
  limit_count: number;
};

export type Profile = {
  id: string;
  nickname: string;
  created_at: string;
};

export type Report = {
  id: string;
  space_id: string;
  reported_by: string;
  reason: string;
  status: "pending" | "resolved";
  resolved_by: string | null;
  resolved_at: string | null;
  admin_note: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: Category;
        Insert: Partial<Category> & Pick<Category, "name">;
        Update: Partial<Category>;
        Relationships: [];
      };
      spaces: {
        Row: Space;
        Insert: Partial<Space> & Pick<Space, "category_id" | "location">;
        Update: Partial<Space>;
        Relationships: [
          {
            foreignKeyName: "spaces_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      submissions: {
        Row: Submission;
        Insert: Partial<Submission> & Pick<Submission, "space_id" | "submitted_by">;
        Update: Partial<Submission>;
        Relationships: [
          {
            foreignKeyName: "submissions_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      monthly_registration_usage: {
        Row: MonthlyRegistrationUsage;
        Insert: Partial<MonthlyRegistrationUsage> &
          Pick<MonthlyRegistrationUsage, "user_id" | "month">;
        Update: Partial<MonthlyRegistrationUsage>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, "id" | "nickname">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      reports: {
        Row: Report;
        Insert: Partial<Report> & Pick<Report, "space_id" | "reported_by" | "reason">;
        Update: Partial<Report>;
        Relationships: [
          {
            foreignKeyName: "reports_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      submit_for_review: {
        Args: { target_space_id: string };
        Returns: string;
      };
      approve_submission: {
        Args: { submission_id: string; admin_id: string };
        Returns: undefined;
      };
    };
  };
};
