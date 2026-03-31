/**
 * Supabase Database Types
 * Auto-generated from schema
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      deleted_sessions: {
        Row: {
          created_at: string;
          id: string;
          session_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          session_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      emt_messages: {
        Row: {
          id: string;
          stream_id: string;
          stream_position: string;
          partition: string;
          message_kind: string;
          message_data: string;
          message_metadata: string;
          message_schema_version: string | null;
          message_type: string;
          message_id: string;
          is_archived: number;
          global_position: string;
          created: string;
        };
        Insert: {
          id: string;
          stream_id: string;
          stream_position: string;
          partition?: string;
          message_kind: string;
          message_data: string;
          message_metadata?: string;
          message_schema_version?: string | null;
          message_type: string;
          message_id: string;
          is_archived?: number;
          global_position: string;
          created?: string;
        };
        Update: {
          id?: string;
          stream_id?: string;
          stream_position?: string;
          partition?: string;
          message_kind?: string;
          message_data?: string;
          message_metadata?: string;
          message_schema_version?: string | null;
          message_type?: string;
          message_id?: string;
          is_archived?: number;
          global_position?: string;
          created?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          client_updated_at: number | null;
          config: Json;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          client_updated_at?: number | null;
          config?: Json;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          client_updated_at?: number | null;
          config?: Json;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          cancelled_at: string | null;
          created_at: string | null;
          expires_at: string | null;
          external_id: string | null;
          id: string;
          payment_provider: string | null;
          plan_type: string;
          started_at: string | null;
          status: string;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          cancelled_at?: string | null;
          created_at?: string | null;
          expires_at?: string | null;
          external_id?: string | null;
          id?: string;
          payment_provider?: string | null;
          plan_type?: string;
          started_at?: string | null;
          status?: string;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          cancelled_at?: string | null;
          created_at?: string | null;
          expires_at?: string | null;
          external_id?: string | null;
          id?: string;
          payment_provider?: string | null;
          plan_type?: string;
          started_at?: string | null;
          status?: string;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      users: {
        Row: {
          auth_user_id: string | null;
          avatar_id: string | null;
          created_at: string | null;
          id: string;
          updated_at: string | null;
          username: string | null;
        };
        Insert: {
          auth_user_id?: string | null;
          avatar_id?: string | null;
          created_at?: string | null;
          id?: string;
          updated_at?: string | null;
          username?: string | null;
        };
        Update: {
          auth_user_id?: string | null;
          avatar_id?: string | null;
          created_at?: string | null;
          id?: string;
          updated_at?: string | null;
          username?: string | null;
        };
        Relationships: [];
      };
      user_rewards: {
        Row: {
          id: string;
          user_id: string;
          reward_id: string;
          granted_at: string;
          expires_at: string | null;
          revenuecat_response: Json | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          reward_id: string;
          granted_at?: string;
          expires_at?: string | null;
          revenuecat_response?: Json | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          reward_id?: string;
          granted_at?: string;
          expires_at?: string | null;
          revenuecat_response?: Json | null;
        };
        Relationships: [];
      };
      user_resets: {
        Row: {
          id: string;
          user_id: string;
          reset_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          reset_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          reset_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_sync_now: { Args: { check_user_id: string }; Returns: boolean };
      current_user_has_cloud_sync: { Args: Record<string, never>; Returns: boolean };
      current_user_has_premium: { Args: Record<string, never>; Returns: boolean };
      expire_subscriptions: { Args: Record<string, never>; Returns: number };
      has_cloud_sync: { Args: { check_user_id: string }; Returns: boolean };
      has_premium_access: { Args: { check_user_id: string }; Returns: boolean };
      is_user_premium: { Args: { check_user_id: string }; Returns: boolean };
      upsert_settings_if_newer: {
        Args: { p_user_id: string; p_config: Json; p_client_updated_at: number };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
