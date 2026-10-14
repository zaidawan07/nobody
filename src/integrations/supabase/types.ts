export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agency_subscriptions: {
        Row: {
          agency_id: string
          billing_cycle: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string
          id: string
          plan_id: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          billing_cycle?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          plan_id: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          billing_cycle?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          plan_id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_subscriptions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_tasks: {
        Row: {
          agency_id: string
          assigned_to: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          id: string
          lead_id: string | null
          priority: string
          property_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          priority?: string
          property_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          priority?: string
          property_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_change_requests: {
        Row: {
          agency_id: string
          created_at: string
          created_by: string
          id: string
          note: string | null
          requested_plan_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          requested_plan_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          requested_plan_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          annual_price_pkr: number | null
          code: string
          created_at: string
          description: string | null
          features: string[]
          id: string
          is_active: boolean
          max_ai_replies_per_day: number
          max_leads: number | null
          max_properties: number | null
          max_team_members: number | null
          monthly_price_pkr: number | null
          name: string
          updated_at: string
        }
        Insert: {
          annual_price_pkr?: number | null
          code: string
          created_at?: string
          description?: string | null
          features?: string[]
          id?: string
          is_active?: boolean
          max_ai_replies_per_day?: number
          max_leads?: number | null
          max_properties?: number | null
          max_team_members?: number | null
          monthly_price_pkr?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          annual_price_pkr?: number | null
          code?: string
          created_at?: string
          description?: string | null
          features?: string[]
          id?: string
          is_active?: boolean
          max_ai_replies_per_day?: number
          max_leads?: number | null
          max_properties?: number | null
          max_team_members?: number | null
          monthly_price_pkr?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }

        Row: {
          agency_id: string
          assigned_to: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          id: string
          lead_id: string | null
          priority: string
          property_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          priority?: string
          property_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          priority?: string
          property_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      agencies: {
        Row: {
          cities_served: string[]
          created_at: string
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          office_address: string | null
          phone: string | null
          slug: string | null
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
          whatsapp_number: string | null
          working_hours: string | null
        }
        Insert: {
          cities_served?: string[]
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          office_address?: string | null
          phone?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          whatsapp_number?: string | null
          working_hours?: string | null
        }
        Update: {
          cities_served?: string[]
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          office_address?: string | null
          phone?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          whatsapp_number?: string | null
          working_hours?: string | null
        }
        Relationships: []
      }
      conversation_messages: {
        Row: {
          agency_id: string
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          media_url: string | null
          referenced_property_id: string | null
          sender: Database["public"]["Enums"]["message_sender"]
        }
        Insert: {
          agency_id: string
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          media_url?: string | null
          referenced_property_id?: string | null
          sender: Database["public"]["Enums"]["message_sender"]
        }
        Update: {
          agency_id?: string
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          media_url?: string | null
          referenced_property_id?: string | null
          sender?: Database["public"]["Enums"]["message_sender"]
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_referenced_property_id_fkey"
            columns: ["referenced_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agency_id: string
          assigned_to: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string
          handoff_reason: string | null
          handoff_requested: boolean
          id: string
          last_message_at: string | null
          lead_id: string | null
          state: Database["public"]["Enums"]["conversation_state"]
          updated_at: string
        }
        Insert: {
          agency_id: string
          assigned_to?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone: string
          handoff_reason?: string | null
          handoff_requested?: boolean
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          state?: Database["public"]["Enums"]["conversation_state"]
          updated_at?: string
        }
        Update: {
          agency_id?: string
          assigned_to?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string
          handoff_reason?: string | null
          handoff_requested?: boolean
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          state?: Database["public"]["Enums"]["conversation_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agency_id: string
          assigned_to: string | null
          budget_max_pkr: number | null
          budget_min_pkr: number | null
          created_at: string
          id: string
          name: string | null
          notes: string | null
          phone: string | null
          preferred_city: string | null
          preferred_locality: string | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          purpose: Database["public"]["Enums"]["property_purpose"] | null
          requirement_text: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          agency_id: string
          assigned_to?: string | null
          budget_max_pkr?: number | null
          budget_min_pkr?: number | null
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          phone?: string | null
          preferred_city?: string | null
          preferred_locality?: string | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          purpose?: Database["public"]["Enums"]["property_purpose"] | null
          requirement_text?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          agency_id?: string
          assigned_to?: string | null
          budget_max_pkr?: number | null
          budget_min_pkr?: number | null
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          phone?: string | null
          preferred_city?: string | null
          preferred_locality?: string | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          purpose?: Database["public"]["Enums"]["property_purpose"] | null
          requirement_text?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          agency_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          job_title: string | null
          phone: string | null
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          agency_id: string
          area_unit: Database["public"]["Enums"]["area_unit"] | null
          area_value: number | null
          assigned_to: string | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          created_at: string
          created_by: string | null
          description: string | null
          features: string[]
          furnished: boolean
          id: string
          latitude: number | null
          locality: string | null
          longitude: number | null
          phase_block: string | null
          price_pkr: number | null
          property_type: Database["public"]["Enums"]["property_type"]
          purpose: Database["public"]["Enums"]["property_purpose"]
          reference_code: string | null
          society: string | null
          status: Database["public"]["Enums"]["property_status"]
          title: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          agency_id: string
          area_unit?: Database["public"]["Enums"]["area_unit"] | null
          area_value?: number | null
          assigned_to?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          features?: string[]
          furnished?: boolean
          id?: string
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          phase_block?: string | null
          price_pkr?: number | null
          property_type: Database["public"]["Enums"]["property_type"]
          purpose: Database["public"]["Enums"]["property_purpose"]
          reference_code?: string | null
          society?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          title: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          agency_id?: string
          area_unit?: Database["public"]["Enums"]["area_unit"] | null
          area_value?: number | null
          assigned_to?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          features?: string[]
          furnished?: boolean
          id?: string
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          phase_block?: string | null
          price_pkr?: number | null
          property_type?: Database["public"]["Enums"]["property_type"]
          purpose?: Database["public"]["Enums"]["property_purpose"]
          reference_code?: string | null
          society?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_media: {
        Row: {
          agency_id: string
          caption: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["media_kind"]
          property_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          agency_id: string
          caption?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          property_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          agency_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          property_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_media_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_media_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          agency_id: string
          assigned_to: string | null
          confirmed: boolean
          created_at: string
          id: string
          lead_id: string | null
          notes: string | null
          property_id: string | null
          requested_at: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["visit_status"]
          updated_at: string
        }
        Insert: {
          agency_id: string
          assigned_to?: string | null
          confirmed?: boolean
          created_at?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          property_id?: string | null
          requested_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          updated_at?: string
        }
        Update: {
          agency_id?: string
          assigned_to?: string | null
          confirmed?: boolean
          created_at?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          property_id?: string | null
          requested_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          agency_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          agency_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          agency_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_configs: {
        Row: {
          agency_id: string
          ai_enabled: boolean
          ai_greeting: string | null
          ai_instructions: string | null
          ai_language: string
          ai_tone: string | null
          auto_create_leads: boolean
          connection_error: string | null
          connection_status: Database["public"]["Enums"]["whatsapp_connection_status"]
          created_at: string
          display_name: string | null
          handoff_keywords: string[]
          id: string
          last_connected_at: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          agency_id: string
          ai_enabled?: boolean
          ai_greeting?: string | null
          ai_instructions?: string | null
          ai_language?: string
          ai_tone?: string | null
          auto_create_leads?: boolean
          connection_error?: string | null
          connection_status?: Database["public"]["Enums"]["whatsapp_connection_status"]
          created_at?: string
          display_name?: string | null
          handoff_keywords?: string[]
          id?: string
          last_connected_at?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          agency_id?: string
          ai_enabled?: boolean
          ai_greeting?: string | null
          ai_instructions?: string | null
          ai_language?: string
          ai_tone?: string | null
          auto_create_leads?: boolean
          connection_error?: string | null
          connection_status?: Database["public"]["Enums"]["whatsapp_connection_status"]
          created_at?: string
          display_name?: string | null
          handoff_keywords?: string[]
          id?: string
          last_connected_at?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_configs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_agency_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_agency_admin: { Args: { _agency_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      resolve_subscription_change_request: {
        Args: { _request_id: string; _decision: string; _actor_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_status: "active" | "suspended" | "pending"
      app_role: "super_admin" | "agency_admin" | "employee"
      area_unit: "marla" | "kanal" | "sqft" | "sqyd" | "acre"
      conversation_state: "ai_active" | "human_active" | "closed"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "visit_scheduled"
        | "negotiating"
        | "won"
        | "lost"
      media_kind: "photo" | "video" | "document"
      message_sender: "customer" | "ai" | "employee" | "system"
      property_purpose: "sale" | "rent"
      property_status: "available" | "reserved" | "sold" | "rented" | "inactive"
      property_type:
        | "house"
        | "apartment"
        | "plot"
        | "commercial"
        | "office"
        | "shop"
        | "warehouse"
        | "agricultural"
      visit_status:
        | "requested"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      whatsapp_connection_status:
        | "not_connected"
        | "pending"
        | "connected"
        | "error"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "suspended", "pending"],
      app_role: ["super_admin", "agency_admin", "employee"],
      area_unit: ["marla", "kanal", "sqft", "sqyd", "acre"],
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
      property_status: ["available", "reserved", "sold", "rented", "inactive"],
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
      visit_status: [
        "requested",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      whatsapp_connection_status: [
        "not_connected",
        "pending",
        "connected",
        "error",
      ],
    },
  },
} as const
