export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      consent_records: {
        Row: {
          id: string;
          user_id: string | null;
          accepted: boolean;
          version: string;
          accepted_at: string;
          parental_consent: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          accepted: boolean;
          version: string;
          accepted_at: string;
          parental_consent: boolean;
          created_at?: string;
        };
        Update: never;
      };
      children: {
        Row: {
          id: string;
          parent_id: string;
          name: string;
          grade: string;
          subjects: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          name: string;
          grade: string;
          subjects?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          grade?: string;
          subjects?: string[];
          updated_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          child_id: string;
          parent_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          child_id: string;
          parent_id: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: "user" | "model";
          content: string;
          has_image: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: "user" | "model";
          content: string;
          has_image?: boolean;
          created_at?: string;
        };
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Convenience row types
export type Child = Database["public"]["Tables"]["children"]["Row"];
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
