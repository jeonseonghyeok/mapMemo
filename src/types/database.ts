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
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: Category;
        Insert: Partial<Category> & Pick<Category, "name">;
        Update: Partial<Category>;
      };
      spaces: {
        Row: Space;
        Insert: Partial<Space> & Pick<Space, "category_id" | "location">;
        Update: Partial<Space>;
      };
    };
  };
};
