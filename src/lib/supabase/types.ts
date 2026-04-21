export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------------------------------------------------------------------------
// Study-mode / gamification shared primitives
// ---------------------------------------------------------------------------

export type StudyMode = "prova" | "estudo";
export type StudyPlanStatus = "draft" | "active" | "completed" | "archived";
export type FlashcardDifficulty = "easy" | "medium" | "hard";

export type XpReason =
  | "flashcard_no_hint"
  | "flashcard_1_hint"
  | "flashcard_2plus_hints"
  | "error_read_debrief"
  | "simulado_completed"
  | "focus_session"
  | "achievement_unlock"
  | "daily_complete"
  | "weekly_complete";

export type QuestType = "daily" | "weekly" | "campaign_mission";
export type QuestStatus = "active" | "completed" | "expired" | "abandoned";
export type PowerUpRarity = "common" | "uncommon" | "rare";
export type RankDivision = "I" | "II" | "III";

export interface Sm2State {
  ef: number;
  interval: number;
  repetitions: number;
  quality: number;
  due_at?: string;
}

export interface QuestObjective {
  kind: string;
  target: number;
  progress: number;
}

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
      study_plans: {
        Row: {
          id: string;
          parent_id: string;
          child_id: string;
          subject: string;
          topic: string;
          exam_date: string | null;
          status: StudyPlanStatus;
          metadata: Json;
          mastery_summary: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          child_id: string;
          subject: string;
          topic: string;
          exam_date?: string | null;
          status?: StudyPlanStatus;
          metadata?: Json;
          mastery_summary?: Json;
        };
        Update: {
          subject?: string;
          topic?: string;
          exam_date?: string | null;
          status?: StudyPlanStatus;
          metadata?: Json;
          mastery_summary?: Json;
        };
      };
      study_topics: {
        Row: {
          id: string;
          plan_id: string;
          parent_id: string;
          title: string;
          order: number;
          mastery_score: number;
          last_reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          parent_id: string;
          title: string;
          order?: number;
          mastery_score?: number;
          last_reviewed_at?: string | null;
        };
        Update: {
          title?: string;
          order?: number;
          mastery_score?: number;
          last_reviewed_at?: string | null;
        };
      };
      flashcards: {
        Row: {
          id: string;
          topic_id: string;
          parent_id: string;
          child_id: string;
          question: string;
          hint_chain: Json;
          answer_explanation: string;
          difficulty: FlashcardDifficulty;
          sm2_state: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          topic_id: string;
          parent_id: string;
          child_id: string;
          question: string;
          hint_chain?: Json;
          answer_explanation: string;
          difficulty?: FlashcardDifficulty;
          sm2_state?: Json;
        };
        Update: {
          question?: string;
          hint_chain?: Json;
          answer_explanation?: string;
          difficulty?: FlashcardDifficulty;
          sm2_state?: Json;
        };
      };
      study_sessions: {
        Row: {
          id: string;
          parent_id: string;
          child_id: string;
          mode: StudyMode;
          plan_id: string | null;
          started_at: string;
          ended_at: string | null;
          questions_asked: number;
          cards_reviewed: number;
          cards_correct: number;
          socratic_engagement_score: number;
          mastery_delta: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          child_id: string;
          mode: StudyMode;
          plan_id?: string | null;
          started_at?: string;
          ended_at?: string | null;
          questions_asked?: number;
          cards_reviewed?: number;
          cards_correct?: number;
          socratic_engagement_score?: number;
          mastery_delta?: Json;
        };
        Update: {
          ended_at?: string | null;
          questions_asked?: number;
          cards_reviewed?: number;
          cards_correct?: number;
          socratic_engagement_score?: number;
          mastery_delta?: Json;
        };
      };
      user_profile: {
        Row: {
          id: string;
          child_id: string;
          parent_id: string;
          display_title: string | null;
          current_rank: string;
          rank_division: RankDivision;
          total_xp: number;
          rank_mmr: number;
          active_title: string | null;
          profile_frame: string | null;
          streak_days: number;
          last_active_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          child_id: string;
          parent_id: string;
          display_title?: string | null;
          current_rank?: string;
          rank_division?: RankDivision;
          total_xp?: number;
          rank_mmr?: number;
          active_title?: string | null;
          profile_frame?: string | null;
          streak_days?: number;
          last_active_at?: string | null;
        };
        Update: {
          display_title?: string | null;
          current_rank?: string;
          rank_division?: RankDivision;
          total_xp?: number;
          rank_mmr?: number;
          active_title?: string | null;
          profile_frame?: string | null;
          streak_days?: number;
          last_active_at?: string | null;
        };
      };
      xp_events: {
        Row: {
          id: string;
          parent_id: string;
          child_id: string;
          delta: number;
          reason: XpReason;
          context: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          child_id: string;
          delta: number;
          reason: XpReason;
          context?: Json;
        };
        Update: never;
      };
      achievements_catalog: {
        Row: {
          code: string;
          name: string;
          description: string;
          xp_reward: number;
          is_hidden: boolean;
          trigger_rule: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
      };
      user_achievements: {
        Row: {
          id: string;
          parent_id: string;
          child_id: string;
          achievement_code: string;
          unlocked_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          child_id: string;
          achievement_code: string;
          unlocked_at?: string;
        };
        Update: never;
      };
      quests: {
        Row: {
          id: string;
          parent_id: string;
          child_id: string;
          quest_type: QuestType;
          campaign_id: string | null;
          title: string;
          description: string;
          objectives: Json;
          xp_reward: number;
          expires_at: string | null;
          status: QuestStatus;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          child_id: string;
          quest_type: QuestType;
          campaign_id?: string | null;
          title: string;
          description?: string;
          objectives?: Json;
          xp_reward?: number;
          expires_at?: string | null;
          status?: QuestStatus;
          completed_at?: string | null;
        };
        Update: {
          title?: string;
          description?: string;
          objectives?: Json;
          xp_reward?: number;
          expires_at?: string | null;
          status?: QuestStatus;
          completed_at?: string | null;
        };
      };
      power_ups: {
        Row: {
          code: string;
          name: string;
          description: string;
          rarity: PowerUpRarity;
        };
        Insert: never;
        Update: never;
      };
      user_inventory: {
        Row: {
          id: string;
          parent_id: string;
          child_id: string;
          power_up_code: string;
          qty: number;
          acquired_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          child_id: string;
          power_up_code: string;
          qty?: number;
          acquired_at?: string;
        };
        Update: {
          qty?: number;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      award_xp: {
        Args: {
          p_child_id: string;
          p_delta: number;
          p_reason: XpReason;
          p_context?: Json;
        };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
  };
}

// Convenience row types
export type Child = Database["public"]["Tables"]["children"]["Row"];
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];

export type StudyPlan = Database["public"]["Tables"]["study_plans"]["Row"];
export type StudyTopic = Database["public"]["Tables"]["study_topics"]["Row"];
export type Flashcard = Database["public"]["Tables"]["flashcards"]["Row"];
export type StudySession = Database["public"]["Tables"]["study_sessions"]["Row"];
export type UserProfile = Database["public"]["Tables"]["user_profile"]["Row"];
export type XpEvent = Database["public"]["Tables"]["xp_events"]["Row"];
export type AchievementCatalogRow = Database["public"]["Tables"]["achievements_catalog"]["Row"];
export type UserAchievement = Database["public"]["Tables"]["user_achievements"]["Row"];
export type Quest = Database["public"]["Tables"]["quests"]["Row"];
export type PowerUp = Database["public"]["Tables"]["power_ups"]["Row"];
export type UserInventoryRow = Database["public"]["Tables"]["user_inventory"]["Row"];
