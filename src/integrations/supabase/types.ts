export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: "XX" }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      agencies: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          logo_url: string | null;
          phone: string | null;
          whatsapp_number: string | null;
          email: string | null;
          office_address: string | null;
          cities_served: string[];
          description: string | null;
          working_hours: string | null;
          status: Database["public"]["Enums"]["account_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug?: string | null;
          logo_url?: string | null;
          phone?: string | null;
          whatsapp_number?: string | null;
          email?: string | null;
          office_address?: string | null;
          cities_served?: string[];
          description?: string | null;
          working_hours?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string | null;
          logo_url?: string | null;
          phone?: string | null;
          whatsapp_number?: string | null;
          email?: string | null;
          office_address?: string | null;
          cities_served?: string[];
          description?: string | null;
          working_hours?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      // TODO(regen): hand-added for migration 0014_team_invitations.sql.
      // Replace this block by regenerating from the live schema; until then it
      // is the only source of the new table's types and must stay in sync with
      // that migration by hand.
      agency_invitations: {
        Row: {
          id: string;
          agency_id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          job_title: string | null;
          role: Database["public"]["Enums"]["invited_role"];
          status: Database["public"]["Enums"]["invitation_status"];
          invited_by: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          last_sent_at: string | null;
          send_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          job_title?: string | null;
          role?: Database["public"]["Enums"]["invited_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          invited_by: string;
          expires_at: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          last_sent_at?: string | null;
          send_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          email?: string;
          full_name?: string | null;
          phone?: string | null;
          job_title?: string | null;
          role?: Database["public"]["Enums"]["invited_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          invited_by?: string;
          expires_at?: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          last_sent_at?: string | null;
          send_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          actor_role: Database["public"]["Enums"]["app_role"] | null;
          agency_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Json;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          actor_role?: Database["public"]["Enums"]["app_role"] | null;
          agency_id?: string | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          actor_role?: Database["public"]["Enums"]["app_role"] | null;
          agency_id?: string | null;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_messages: {
        Row: {
          id: string;
          agency_id: string;
          conversation_id: string;
          sender: Database["public"]["Enums"]["message_sender"];
          body: string | null;
          media_url: string | null;
          referenced_property_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          conversation_id: string;
          sender: Database["public"]["Enums"]["message_sender"];
          body?: string | null;
          media_url?: string | null;
          referenced_property_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          conversation_id?: string;
          sender?: Database["public"]["Enums"]["message_sender"];
          body?: string | null;
          media_url?: string | null;
          referenced_property_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_messages_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_messages_referenced_property_id_fkey";
            columns: ["referenced_property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          id: string;
          agency_id: string;
          customer_phone: string;
          customer_name: string | null;
          lead_id: string | null;
          state: Database["public"]["Enums"]["conversation_state"];
          handoff_requested: boolean;
          handoff_reason: string | null;
          assigned_to: string | null;
          last_message_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          customer_phone: string;
          customer_name?: string | null;
          lead_id?: string | null;
          state?: Database["public"]["Enums"]["conversation_state"];
          handoff_requested?: boolean;
          handoff_reason?: string | null;
          assigned_to?: string | null;
          last_message_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          customer_phone?: string;
          customer_name?: string | null;
          lead_id?: string | null;
          state?: Database["public"]["Enums"]["conversation_state"];
          handoff_requested?: boolean;
          handoff_reason?: string | null;
          assigned_to?: string | null;
          last_message_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      // TODO(regen): hand-added for 0015_lead_timeline_followups.sql.
      lead_activities: {
        Row: {
          id: string;
          agency_id: string;
          lead_id: string;
          type: Database["public"]["Enums"]["lead_activity_type"];
          body: string | null;
          author_id: string | null;
          metadata: Json;
          is_system: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id?: string;
          lead_id: string;
          type: Database["public"]["Enums"]["lead_activity_type"];
          body?: string | null;
          author_id?: string | null;
          metadata?: Json;
          is_system?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          lead_id?: string;
          type?: Database["public"]["Enums"]["lead_activity_type"];
          body?: string | null;
          author_id?: string | null;
          metadata?: Json;
          is_system?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_activities_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_activities_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_followups: {
        Row: {
          id: string;
          agency_id: string;
          lead_id: string;
          due_at: string;
          note: string | null;
          status: Database["public"]["Enums"]["followup_status"];
          assigned_to: string | null;
          created_by: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          lead_id: string;
          due_at: string;
          note?: string | null;
          status?: Database["public"]["Enums"]["followup_status"];
          assigned_to?: string | null;
          created_by?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          lead_id?: string;
          due_at?: string;
          note?: string | null;
          status?: Database["public"]["Enums"]["followup_status"];
          assigned_to?: string | null;
          created_by?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_followups_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_followups_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_followups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_followups_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          id: string;
          agency_id: string;
          name: string | null;
          phone: string | null;
          whatsapp_number: string | null;
          requirement_text: string | null;
          budget_min_pkr: number | null;
          budget_max_pkr: number | null;
          preferred_city: string | null;
          preferred_locality: string | null;
          property_type: Database["public"]["Enums"]["property_type"] | null;
          purpose: Database["public"]["Enums"]["property_purpose"] | null;
          status: Database["public"]["Enums"]["lead_status"];
          assigned_to: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          name?: string | null;
          phone?: string | null;
          whatsapp_number?: string | null;
          requirement_text?: string | null;
          budget_min_pkr?: number | null;
          budget_max_pkr?: number | null;
          preferred_city?: string | null;
          preferred_locality?: string | null;
          property_type?: Database["public"]["Enums"]["property_type"] | null;
          purpose?: Database["public"]["Enums"]["property_purpose"] | null;
          status?: Database["public"]["Enums"]["lead_status"];
          assigned_to?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          name?: string | null;
          phone?: string | null;
          whatsapp_number?: string | null;
          requirement_text?: string | null;
          budget_min_pkr?: number | null;
          budget_max_pkr?: number | null;
          preferred_city?: string | null;
          preferred_locality?: string | null;
          property_type?: Database["public"]["Enums"]["property_type"] | null;
          purpose?: Database["public"]["Enums"]["property_purpose"] | null;
          status?: Database["public"]["Enums"]["lead_status"];
          assigned_to?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          id: string;
          name: string;
          kind: string;
          parent_id: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          kind: string;
          parent_id?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          kind?: string;
          parent_id?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "locations_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_features: {
        Row: {
          id: string;
          plan_id: string;
          feature_key: string;
          feature_value: string | null;
          included: boolean;
          limit_value: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          feature_key: string;
          feature_value?: string | null;
          included?: boolean;
          limit_value?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          feature_key?: string;
          feature_value?: string | null;
          included?: boolean;
          limit_value?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price_pkr: number;
          interval: Database["public"]["Enums"]["plan_interval"];
          trial_days: number;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          price_pkr?: number;
          interval?: Database["public"]["Enums"]["plan_interval"];
          trial_days?: number;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          price_pkr?: number;
          interval?: Database["public"]["Enums"]["plan_interval"];
          trial_days?: number;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          agency_id: string | null;
          type: string;
          title: string;
          body: string | null;
          entity_type: string | null;
          entity_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          agency_id?: string | null;
          type: string;
          title: string;
          body?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          agency_id?: string | null;
          type?: string;
          title?: string;
          body?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_bootstrap: {
        Row: {
          id: boolean;
          claimed_by: string;
          claimed_at: string;
        };
        Insert: {
          id?: boolean;
          claimed_by: string;
          claimed_at?: string;
        };
        Update: {
          id?: boolean;
          claimed_by?: string;
          claimed_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          agency_id: string | null;
          full_name: string | null;
          phone: string | null;
          email: string | null;
          job_title: string | null;
          status: Database["public"]["Enums"]["account_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          agency_id?: string | null;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          job_title?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string | null;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          job_title?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      properties: {
        Row: {
          id: string;
          agency_id: string;
          reference_code: string | null;
          title: string;
          property_type: Database["public"]["Enums"]["property_type"];
          purpose: Database["public"]["Enums"]["property_purpose"];
          status: Database["public"]["Enums"]["property_status"];
          price_pkr: number | null;
          area_value: number | null;
          area_unit: Database["public"]["Enums"]["area_unit"] | null;
          city: string | null;
          society: string | null;
          phase_block: string | null;
          locality: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          bedrooms: number | null;
          bathrooms: number | null;
          furnished: boolean;
          description: string | null;
          features: string[];
          assigned_to: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          owner_name: string | null;
          owner_phone: string | null;
          tenant_name: string | null;
          tenant_phone: string | null;
          realtor_name: string | null;
          realtor_phone: string | null;
          province: string | null;
          division: string | null;
          district: string | null;
          tehsil: string | null;
          block: string | null;
          rent_period: string | null;
        };
        Insert: {
          id?: string;
          agency_id: string;
          reference_code?: string | null;
          title: string;
          property_type: Database["public"]["Enums"]["property_type"];
          purpose: Database["public"]["Enums"]["property_purpose"];
          status?: Database["public"]["Enums"]["property_status"];
          price_pkr?: number | null;
          area_value?: number | null;
          area_unit?: Database["public"]["Enums"]["area_unit"] | null;
          city?: string | null;
          society?: string | null;
          phase_block?: string | null;
          locality?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          bedrooms?: number | null;
          bathrooms?: number | null;
          furnished?: boolean;
          description?: string | null;
          features?: string[];
          assigned_to?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          owner_name?: string | null;
          owner_phone?: string | null;
          tenant_name?: string | null;
          tenant_phone?: string | null;
          realtor_name?: string | null;
          realtor_phone?: string | null;
          province?: string | null;
          division?: string | null;
          district?: string | null;
          tehsil?: string | null;
          block?: string | null;
          rent_period?: string | null;
        };
        Update: {
          id?: string;
          agency_id?: string;
          reference_code?: string | null;
          title?: string;
          property_type?: Database["public"]["Enums"]["property_type"];
          purpose?: Database["public"]["Enums"]["property_purpose"];
          status?: Database["public"]["Enums"]["property_status"];
          price_pkr?: number | null;
          area_value?: number | null;
          area_unit?: Database["public"]["Enums"]["area_unit"] | null;
          city?: string | null;
          society?: string | null;
          phase_block?: string | null;
          locality?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          bedrooms?: number | null;
          bathrooms?: number | null;
          furnished?: boolean;
          description?: string | null;
          features?: string[];
          assigned_to?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          owner_name?: string | null;
          owner_phone?: string | null;
          tenant_name?: string | null;
          tenant_phone?: string | null;
          realtor_name?: string | null;
          realtor_phone?: string | null;
          province?: string | null;
          division?: string | null;
          district?: string | null;
          tehsil?: string | null;
          block?: string | null;
          rent_period?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "properties_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "properties_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "properties_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      property_checkins: {
        Row: {
          id: string;
          agency_id: string;
          assigned_to: string | null;
          property_id: string;
          contact_type: Database["public"]["Enums"]["checkin_contact_type"];
          contact_name: string | null;
          contact_phone: string;
          channel: Database["public"]["Enums"]["checkin_channel"];
          scheduled_for: string;
          status: Database["public"]["Enums"]["checkin_status"];
          sent_at: string | null;
          consent_at: string | null;
          consent_recorded_by: string | null;
          consent_source: string | null;
          prepared_at: string | null;
          response_text: string | null;
          property_condition: string | null;
          is_vacant: boolean | null;
          provider_error: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          assigned_to?: string | null;
          property_id: string;
          contact_type: Database["public"]["Enums"]["checkin_contact_type"];
          contact_name?: string | null;
          contact_phone: string;
          channel?: Database["public"]["Enums"]["checkin_channel"];
          scheduled_for: string;
          status?: Database["public"]["Enums"]["checkin_status"];
          sent_at?: string | null;
          consent_at?: string | null;
          consent_recorded_by?: string | null;
          consent_source?: string | null;
          prepared_at?: string | null;
          response_text?: string | null;
          property_condition?: string | null;
          is_vacant?: boolean | null;
          provider_error?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          assigned_to?: string | null;
          property_id?: string;
          contact_type?: Database["public"]["Enums"]["checkin_contact_type"];
          contact_name?: string | null;
          contact_phone?: string;
          channel?: Database["public"]["Enums"]["checkin_channel"];
          scheduled_for?: string;
          status?: Database["public"]["Enums"]["checkin_status"];
          sent_at?: string | null;
          consent_at?: string | null;
          consent_recorded_by?: string | null;
          consent_source?: string | null;
          prepared_at?: string | null;
          response_text?: string | null;
          property_condition?: string | null;
          is_vacant?: boolean | null;
          provider_error?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "property_checkins_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "property_checkins_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "property_checkins_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "property_checkins_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      property_media: {
        Row: {
          id: string;
          agency_id: string;
          property_id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          storage_path: string;
          caption: string | null;
          sort_order: number;
          created_at: string;
          thumbnail_path: string | null;
          poster_path: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          is_cover: boolean;
        };
        Insert: {
          id?: string;
          agency_id: string;
          property_id: string;
          kind?: Database["public"]["Enums"]["media_kind"];
          storage_path: string;
          caption?: string | null;
          sort_order?: number;
          created_at?: string;
          thumbnail_path?: string | null;
          poster_path?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          is_cover?: boolean;
        };
        Update: {
          id?: string;
          agency_id?: string;
          property_id?: string;
          kind?: Database["public"]["Enums"]["media_kind"];
          storage_path?: string;
          caption?: string | null;
          sort_order?: number;
          created_at?: string;
          thumbnail_path?: string | null;
          poster_path?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          is_cover?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "property_media_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "property_media_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: true;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      site_visits: {
        Row: {
          id: string;
          agency_id: string;
          lead_id: string | null;
          property_id: string | null;
          requested_at: string | null;
          scheduled_at: string | null;
          assigned_to: string | null;
          status: Database["public"]["Enums"]["visit_status"];
          notes: string | null;
          confirmed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          lead_id?: string | null;
          property_id?: string | null;
          requested_at?: string | null;
          scheduled_at?: string | null;
          assigned_to?: string | null;
          status?: Database["public"]["Enums"]["visit_status"];
          notes?: string | null;
          confirmed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          lead_id?: string | null;
          property_id?: string | null;
          requested_at?: string | null;
          scheduled_at?: string | null;
          assigned_to?: string | null;
          status?: Database["public"]["Enums"]["visit_status"];
          notes?: string | null;
          confirmed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_visits_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_visits_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_visits_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_visits_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          agency_id: string;
          plan_id: string;
          status: Database["public"]["Enums"]["subscription_status"];
          trial_ends_at: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          canceled_at: string | null;
          canceled_by: string | null;
          cancel_reason: string | null;
          payment_provider: string | null;
          payment_provider_subscription_id: string | null;
          payment_provider_customer_id: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          plan_id: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          trial_ends_at?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          canceled_at?: string | null;
          canceled_by?: string | null;
          cancel_reason?: string | null;
          payment_provider?: string | null;
          payment_provider_subscription_id?: string | null;
          payment_provider_customer_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          plan_id?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          trial_ends_at?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          canceled_at?: string | null;
          canceled_by?: string | null;
          cancel_reason?: string | null;
          payment_provider?: string | null;
          payment_provider_subscription_id?: string | null;
          payment_provider_customer_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: true;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_canceled_by_fkey";
            columns: ["canceled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_counters: {
        Row: {
          id: string;
          agency_id: string;
          metric_key: string;
          period_start: string;
          period_end: string;
          count: number;
          limit_value: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          metric_key: string;
          period_start: string;
          period_end: string;
          count?: number;
          limit_value?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          metric_key?: string;
          period_start?: string;
          period_end?: string;
          count?: number;
          limit_value?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_counters_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: Database["public"]["Enums"]["app_role"];
          agency_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: Database["public"]["Enums"]["app_role"];
          agency_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          agency_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_configs: {
        Row: {
          id: string;
          agency_id: string;
          whatsapp_number: string | null;
          display_name: string | null;
          connection_status: Database["public"]["Enums"]["whatsapp_connection_status"];
          connection_error: string | null;
          ai_enabled: boolean;
          ai_greeting: string | null;
          ai_language: string;
          ai_tone: string | null;
          ai_instructions: string | null;
          handoff_keywords: string[];
          auto_create_leads: boolean;
          last_connected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agency_id: string;
          whatsapp_number?: string | null;
          display_name?: string | null;
          connection_status?: Database["public"]["Enums"]["whatsapp_connection_status"];
          connection_error?: string | null;
          ai_enabled?: boolean;
          ai_greeting?: string | null;
          ai_language?: string;
          ai_tone?: string | null;
          ai_instructions?: string | null;
          handoff_keywords?: string[];
          auto_create_leads?: boolean;
          last_connected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agency_id?: string;
          whatsapp_number?: string | null;
          display_name?: string | null;
          connection_status?: Database["public"]["Enums"]["whatsapp_connection_status"];
          connection_error?: string | null;
          ai_enabled?: boolean;
          ai_greeting?: string | null;
          ai_language?: string;
          ai_tone?: string | null;
          ai_instructions?: string | null;
          handoff_keywords?: string[];
          auto_create_leads?: boolean;
          last_connected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_configs_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: true;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      agency_is_billing_active: { Args: { _agency_id: string }; Returns: boolean | null };
      can_access_assigned_record: {
        Args: { _agency_id: string; _assigned_to: string };
        Returns: boolean | null;
      };
      can_inspect_agency: { Args: { _agency_id: string }; Returns: boolean | null };
      count_agency_metric: {
        Args: { _agency_id: string; _metric_key: string };
        Returns: number | null;
      };
      current_agency_id: { Args: never; Returns: string | null };
      has_role: {
        Args: { _user_id: string; _role: Database["public"]["Enums"]["app_role"] };
        Returns: boolean | null;
      };
      is_agency_admin: { Args: { _agency_id: string }; Returns: boolean | null };
      is_super_admin: { Args: never; Returns: boolean | null };
      reopen_property: {
        Args: { _property_id: string; _reason: string };
        Returns: undefined;
      };
      plan_limit_for_agency: {
        Args: { _agency_id: string; _metric_key: string };
        Returns: number | null;
      };
      revoke_agency_invitation: {
        Args: { _agency_id: string; _invitation_id: string; _revoked_by: string };
        Returns: boolean;
      };
    };
    Enums: {
      account_status: "active" | "suspended" | "pending";
      app_role: "super_admin" | "agency_admin" | "employee";
      area_unit: "marla" | "kanal" | "sqft" | "sqyd" | "acre";
      checkin_channel: "whatsapp" | "sms";
      checkin_contact_type: "owner" | "tenant" | "realtor";
      checkin_status: "scheduled" | "sent" | "responded" | "failed" | "skipped";
      conversation_state: "ai_active" | "human_active" | "closed";
      lead_status:
        "new" | "contacted" | "qualified" | "visit_scheduled" | "negotiating" | "won" | "lost";
      media_kind: "photo" | "video" | "document";
      message_sender: "customer" | "ai" | "employee" | "system";
      plan_interval: "monthly" | "yearly";
      property_purpose: "sale" | "rent";
      property_status:
        | "available"
        | "reserved"
        | "sold"
        | "rented"
        | "inactive"
        | "draft"
        | "unavailable"
        | "expired";
      property_type:
        | "house"
        | "apartment"
        | "plot"
        | "commercial"
        | "office"
        | "shop"
        | "warehouse"
        | "agricultural";
      subscription_status: "trialing" | "active" | "past_due" | "canceled" | "expired";
      visit_status: "requested" | "confirmed" | "completed" | "cancelled" | "no_show";
      whatsapp_connection_status: "not_connected" | "pending" | "connected" | "error";
      // TODO(regen): hand-added for 0014_team_invitations.sql.
      invited_role: "agency_admin" | "employee";
      invitation_status: "pending" | "accepted" | "revoked" | "expired";
      // TODO(regen): hand-added for 0015_lead_timeline_followups.sql.
      lead_activity_type: "note" | "call" | "status_change" | "visit" | "assignment" | "system";
      followup_status: "open" | "done" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "suspended", "pending"],
      app_role: ["super_admin", "agency_admin", "employee"],
      area_unit: ["marla", "kanal", "sqft", "sqyd", "acre"],
      checkin_channel: ["whatsapp", "sms"],
      checkin_contact_type: ["owner", "tenant", "realtor"],
      checkin_status: ["scheduled", "sent", "responded", "failed", "skipped"],
      conversation_state: ["ai_active", "human_active", "closed"],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "visit_scheduled",
        "negotiating",
        "won",
        "lost",
      ],
      media_kind: ["photo", "video", "document"],
      message_sender: ["customer", "ai", "employee", "system"],
      property_purpose: ["sale", "rent"],
      property_status: [
        "available",
        "reserved",
        "sold",
        "rented",
        "inactive",
        "draft",
        "unavailable",
        "expired",
      ],
      property_type: [
        "house",
        "apartment",
        "plot",
        "commercial",
        "office",
        "shop",
        "warehouse",
        "agricultural",
      ],
      visit_status: ["requested", "confirmed", "completed", "cancelled", "no_show"],
      whatsapp_connection_status: ["not_connected", "pending", "connected", "error"],
    },
  },
} as const;
