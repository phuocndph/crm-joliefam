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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      ai_config: {
        Row: {
          config_key: string
          config_value: string
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value: string
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: string
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          created_at: string
          id: string
          manager_id: string | null
          setting_name: string
          setting_value: boolean
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_id?: string | null
          setting_name: string
          setting_value?: boolean
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_id?: string | null
          setting_name?: string
          setting_value?: boolean
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assignees: {
        Row: {
          created_at: string
          id: string
          manager_id: string | null
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_id?: string | null
          name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_id?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reason: string | null
          request_id: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          reason?: string | null
          request_id?: string | null
          source?: string
          tenant_id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reason?: string | null
          request_id?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string | null
          bank_name: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_primary: boolean
          reason: string
          source_reference: string | null
          status: string
          tenant_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          worker_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code?: string | null
          bank_name: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          is_primary?: boolean
          reason: string
          source_reference?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          worker_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string | null
          bank_name?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_primary?: boolean
          reason?: string
          source_reference?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_headers: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          product_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          product_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          product_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_headers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_headers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_lines: {
        Row: {
          bom_version_id: string
          created_at: string
          cutting_profile_id: string | null
          formula_parameters: Json
          formula_type: string | null
          id: string
          inventory_item_id: string
          line_type: string
          notes: string | null
          quantity_method: string
          scrap_rate: number
          sequence: number
          standard_quantity: number | null
          tenant_id: string
          unit: string
          updated_at: string
          waste_rate: number
        }
        Insert: {
          bom_version_id: string
          created_at?: string
          cutting_profile_id?: string | null
          formula_parameters?: Json
          formula_type?: string | null
          id?: string
          inventory_item_id: string
          line_type?: string
          notes?: string | null
          quantity_method: string
          scrap_rate?: number
          sequence: number
          standard_quantity?: number | null
          tenant_id?: string
          unit: string
          updated_at?: string
          waste_rate?: number
        }
        Update: {
          bom_version_id?: string
          created_at?: string
          cutting_profile_id?: string | null
          formula_parameters?: Json
          formula_type?: string | null
          id?: string
          inventory_item_id?: string
          line_type?: string
          notes?: string | null
          quantity_method?: string
          scrap_rate?: number
          sequence?: number
          standard_quantity?: number | null
          tenant_id?: string
          unit?: string
          updated_at?: string
          waste_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_lines_bom_version_id_fkey"
            columns: ["bom_version_id"]
            isOneToOne: false
            referencedRelation: "bom_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_cutting_profile_id_fkey"
            columns: ["cutting_profile_id"]
            isOneToOne: false
            referencedRelation: "cutting_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_versions: {
        Row: {
          approval_reason: string | null
          approved_at: string | null
          approved_by: string | null
          bom_id: string
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          notes: string | null
          status: string
          tenant_id: string
          updated_at: string
          version_number: number
        }
        Insert: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bom_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          version_number: number
        }
        Update: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bom_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_versions_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      business_transaction_lines: {
        Row: {
          business_transaction_id: string
          classification_snapshot: Json
          cost_behavior: string | null
          cost_category_id: string | null
          cost_center_id: string | null
          cost_object_id: string | null
          created_at: string
          description: string
          direction: string
          effect_kind: string
          id: string
          line_number: number
          quantity: number
          subtotal: number
          tenant_id: string
          total_amount: number
          traceability: string | null
          unit: string
          unit_price: number
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          business_transaction_id: string
          classification_snapshot?: Json
          cost_behavior?: string | null
          cost_category_id?: string | null
          cost_center_id?: string | null
          cost_object_id?: string | null
          created_at?: string
          description: string
          direction?: string
          effect_kind?: string
          id?: string
          line_number: number
          quantity?: number
          subtotal?: number
          tenant_id?: string
          total_amount?: number
          traceability?: string | null
          unit?: string
          unit_price?: number
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          business_transaction_id?: string
          classification_snapshot?: Json
          cost_behavior?: string | null
          cost_category_id?: string | null
          cost_center_id?: string | null
          cost_object_id?: string | null
          created_at?: string
          description?: string
          direction?: string
          effect_kind?: string
          id?: string
          line_number?: number
          quantity?: number
          subtotal?: number
          tenant_id?: string
          total_amount?: number
          traceability?: string | null
          unit?: string
          unit_price?: number
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_transaction_lines_business_transaction_id_fkey"
            columns: ["business_transaction_id"]
            isOneToOne: false
            referencedRelation: "business_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_transaction_lines_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_transaction_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_transaction_lines_cost_object_id_fkey"
            columns: ["cost_object_id"]
            isOneToOne: false
            referencedRelation: "cost_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      business_transaction_links: {
        Row: {
          business_transaction_id: string
          created_at: string
          created_by: string | null
          id: string
          link_type: string
          linked_id: string
          metadata: Json
          tenant_id: string
        }
        Insert: {
          business_transaction_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          link_type: string
          linked_id: string
          metadata?: Json
          tenant_id?: string
        }
        Update: {
          business_transaction_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          link_type?: string
          linked_id?: string
          metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_transaction_links_business_transaction_id_fkey"
            columns: ["business_transaction_id"]
            isOneToOne: false
            referencedRelation: "business_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      business_transactions: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          counterparty_id: string | null
          counterparty_name_snapshot: string | null
          counterparty_type: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          description: string
          external_reference: string | null
          id: string
          idempotency_key: string
          manager_id: string | null
          payment_status: string | null
          source_id: string | null
          source_type: string | null
          status: string
          subtotal: number
          tenant_id: string
          total_amount: number
          transaction_date: string
          transaction_number: string
          transaction_type_id: string
          updated_at: string
          vat_amount: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          counterparty_id?: string | null
          counterparty_name_snapshot?: string | null
          counterparty_type?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          description: string
          external_reference?: string | null
          id?: string
          idempotency_key: string
          manager_id?: string | null
          payment_status?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          subtotal?: number
          tenant_id?: string
          total_amount?: number
          transaction_date?: string
          transaction_number: string
          transaction_type_id: string
          updated_at?: string
          vat_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          counterparty_id?: string | null
          counterparty_name_snapshot?: string | null
          counterparty_type?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          description?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string
          manager_id?: string | null
          payment_status?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          subtotal?: number
          tenant_id?: string
          total_amount?: number
          transaction_date?: string
          transaction_number?: string
          transaction_type_id?: string
          updated_at?: string
          vat_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_transactions_transaction_type_id_fkey"
            columns: ["transaction_type_id"]
            isOneToOne: false
            referencedRelation: "transaction_types"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_template_settings: {
        Row: {
          address: string | null
          bank_info: string | null
          company_name: string | null
          company_title: string | null
          created_at: string | null
          default_terms: Json | null
          footer_note: string | null
          headquarters: string | null
          id: string
          logo_url: string | null
          phone: string | null
          tax_code: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          bank_info?: string | null
          company_name?: string | null
          company_title?: string | null
          created_at?: string | null
          default_terms?: Json | null
          footer_note?: string | null
          headquarters?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          tax_code?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          bank_info?: string | null
          company_name?: string | null
          company_title?: string | null
          created_at?: string | null
          default_terms?: Json | null
          footer_note?: string | null
          headquarters?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          tax_code?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contract_templates: {
        Row: {
          articles: Json | null
          created_at: string
          id: string
          include_vat: boolean | null
          item_columns: Json | null
          legal_basis: Json | null
          manager_id: string | null
          name: string
          payment_terms: Json | null
          seller_info: Json | null
          tenant_id: string
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          articles?: Json | null
          created_at?: string
          id?: string
          include_vat?: boolean | null
          item_columns?: Json | null
          legal_basis?: Json | null
          manager_id?: string | null
          name: string
          payment_terms?: Json | null
          seller_info?: Json | null
          tenant_id?: string
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          articles?: Json | null
          created_at?: string
          id?: string
          include_vat?: boolean | null
          item_columns?: Json | null
          legal_basis?: Json | null
          manager_id?: string | null
          name?: string
          payment_terms?: Json | null
          seller_info?: Json | null
          tenant_id?: string
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          articles: Json | null
          buyer_info: Json | null
          content: string | null
          contract_date: string | null
          contract_number: string
          created_at: string
          customer_id: string | null
          deposit_amount: number | null
          deposit_percentage: number | null
          document_overrides: Json
          end_date: string | null
          id: string
          include_vat: boolean | null
          items: Json | null
          legal_basis: Json | null
          manager_id: string | null
          notes: string | null
          order_id: string | null
          quote_id: string | null
          seller_info: Json | null
          start_date: string | null
          status: string
          subtotal: number | null
          template_id: string | null
          tenant_id: string
          terms: Json | null
          title: string
          total_amount: number | null
          updated_at: string
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          articles?: Json | null
          buyer_info?: Json | null
          content?: string | null
          contract_date?: string | null
          contract_number: string
          created_at?: string
          customer_id?: string | null
          deposit_amount?: number | null
          deposit_percentage?: number | null
          document_overrides?: Json
          end_date?: string | null
          id?: string
          include_vat?: boolean | null
          items?: Json | null
          legal_basis?: Json | null
          manager_id?: string | null
          notes?: string | null
          order_id?: string | null
          quote_id?: string | null
          seller_info?: Json | null
          start_date?: string | null
          status?: string
          subtotal?: number | null
          template_id?: string | null
          tenant_id?: string
          terms?: Json | null
          title?: string
          total_amount?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          articles?: Json | null
          buyer_info?: Json | null
          content?: string | null
          contract_date?: string | null
          contract_number?: string
          created_at?: string
          customer_id?: string | null
          deposit_amount?: number | null
          deposit_percentage?: number | null
          document_overrides?: Json
          end_date?: string | null
          id?: string
          include_vat?: boolean | null
          items?: Json | null
          legal_basis?: Json | null
          manager_id?: string | null
          notes?: string | null
          order_id?: string | null
          quote_id?: string | null
          seller_info?: Json | null
          start_date?: string | null
          status?: string
          subtotal?: number | null
          template_id?: string | null
          tenant_id?: string
          terms?: Json | null
          title?: string
          total_amount?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "payment_summary"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "contracts_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_categories: {
        Row: {
          code: string
          created_at: string
          default_behavior: string
          default_traceability: string
          description: string | null
          id: string
          is_active: boolean
          level: number
          name: string
          parent_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_behavior?: string
          default_traceability?: string
          description?: string | null
          id?: string
          is_active?: boolean
          level?: number
          name: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_behavior?: string
          default_traceability?: string
          description?: string | null
          id?: string
          is_active?: boolean
          level?: number
          name?: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          center_type: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          manager_id: string | null
          manager_user_id: string | null
          name: string
          parent_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          center_type?: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          manager_user_id?: string | null
          name: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          center_type?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          manager_user_id?: string | null
          name?: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_objects: {
        Row: {
          created_at: string
          display_code: string
          display_name: string | null
          id: string
          is_active: boolean
          object_type: string
          source_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_code: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          object_type: string
          source_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_code?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          object_type?: string
          source_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_predictions: {
        Row: {
          confidence_score: number | null
          created_at: string
          customer_id: string
          factors: Json | null
          id: string
          manager_id: string | null
          prediction_type: string
          prediction_value: number
          tenant_id: string
          updated_at: string
          valid_until: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          customer_id: string
          factors?: Json | null
          id?: string
          manager_id?: string | null
          prediction_type: string
          prediction_value: number
          tenant_id?: string
          updated_at?: string
          valid_until: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          customer_id?: string
          factors?: Json | null
          id?: string
          manager_id?: string | null
          prediction_type?: string
          prediction_value?: number
          tenant_id?: string
          updated_at?: string
          valid_until?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          addresses: Json | null
          assignee_id: string | null
          auto_tags: string[] | null
          company: string | null
          created_at: string
          current_status: string | null
          customer_code: string | null
          email: string | null
          id: string
          last_care_date: string | null
          last_purchase_date: string | null
          manager_id: string | null
          name: string
          notes: string | null
          phone: string | null
          phones: Json | null
          purchase_count: number | null
          tags: string[] | null
          tenant_id: string
          total_spent: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          addresses?: Json | null
          assignee_id?: string | null
          auto_tags?: string[] | null
          company?: string | null
          created_at?: string
          current_status?: string | null
          customer_code?: string | null
          email?: string | null
          id?: string
          last_care_date?: string | null
          last_purchase_date?: string | null
          manager_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          phones?: Json | null
          purchase_count?: number | null
          tags?: string[] | null
          tenant_id?: string
          total_spent?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          addresses?: Json | null
          assignee_id?: string | null
          auto_tags?: string[] | null
          company?: string | null
          created_at?: string
          current_status?: string | null
          customer_code?: string | null
          email?: string | null
          id?: string
          last_care_date?: string | null
          last_purchase_date?: string | null
          manager_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          phones?: Json | null
          purchase_count?: number | null
          tags?: string[] | null
          tenant_id?: string
          total_spent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "assignees"
            referencedColumns: ["id"]
          },
        ]
      }
      cutting_profile_versions: {
        Row: {
          allow_rotation: boolean
          approval_reason: string | null
          approved_at: string | null
          approved_by: string | null
          calculation_strategy: string
          created_at: string
          created_by: string | null
          cutting_profile_id: string
          default_fabric_width_cm: number | null
          effective_from: string | null
          effective_to: string | null
          engine_version: string
          flap_allowance_cm: number
          hem_allowance_cm: number
          id: string
          issue_rounding_increment: number
          joining_allowance_cm: number
          joining_allowed: boolean
          joining_rule: string
          notes: string | null
          pattern_direction: string
          pattern_repeat_cm: number | null
          piece_length_parameter_cm: number | null
          piece_length_rule: string
          piece_width_parameter_cm: number | null
          piece_width_rule: string
          pieces_per_product: number
          requires_matching_pattern: boolean
          seam_allowance_cm: number
          standard_waste_rate: number
          status: string
          tenant_id: string
          tuck_depth_cm: number
          updated_at: string
          version_number: number
        }
        Insert: {
          allow_rotation?: boolean
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          calculation_strategy?: string
          created_at?: string
          created_by?: string | null
          cutting_profile_id: string
          default_fabric_width_cm?: number | null
          effective_from?: string | null
          effective_to?: string | null
          engine_version?: string
          flap_allowance_cm?: number
          hem_allowance_cm?: number
          id?: string
          issue_rounding_increment?: number
          joining_allowance_cm?: number
          joining_allowed?: boolean
          joining_rule?: string
          notes?: string | null
          pattern_direction?: string
          pattern_repeat_cm?: number | null
          piece_length_parameter_cm?: number | null
          piece_length_rule?: string
          piece_width_parameter_cm?: number | null
          piece_width_rule?: string
          pieces_per_product?: number
          requires_matching_pattern?: boolean
          seam_allowance_cm?: number
          standard_waste_rate?: number
          status?: string
          tenant_id?: string
          tuck_depth_cm?: number
          updated_at?: string
          version_number: number
        }
        Update: {
          allow_rotation?: boolean
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          calculation_strategy?: string
          created_at?: string
          created_by?: string | null
          cutting_profile_id?: string
          default_fabric_width_cm?: number | null
          effective_from?: string | null
          effective_to?: string | null
          engine_version?: string
          flap_allowance_cm?: number
          hem_allowance_cm?: number
          id?: string
          issue_rounding_increment?: number
          joining_allowance_cm?: number
          joining_allowed?: boolean
          joining_rule?: string
          notes?: string | null
          pattern_direction?: string
          pattern_repeat_cm?: number | null
          piece_length_parameter_cm?: number | null
          piece_length_rule?: string
          piece_width_parameter_cm?: number | null
          piece_width_rule?: string
          pieces_per_product?: number
          requires_matching_pattern?: boolean
          seam_allowance_cm?: number
          standard_waste_rate?: number
          status?: string
          tenant_id?: string
          tuck_depth_cm?: number
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cutting_profile_versions_cutting_profile_id_fkey"
            columns: ["cutting_profile_id"]
            isOneToOne: false
            referencedRelation: "cutting_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cutting_profiles: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          manufacturing_type: string
          name: string
          product_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          manufacturing_type: string
          name: string
          product_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          manufacturing_type?: string
          name?: string
          product_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutting_profiles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutting_profiles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoice_actions: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          einvoice_id: string | null
          error_message: string | null
          id: string
          manager_id: string | null
          request: Json | null
          response: Json | null
          status: string | null
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          einvoice_id?: string | null
          error_message?: string | null
          id?: string
          manager_id?: string | null
          request?: Json | null
          response?: Json | null
          status?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          einvoice_id?: string | null
          error_message?: string | null
          id?: string
          manager_id?: string | null
          request?: Json | null
          response?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "einvoice_actions_einvoice_id_fkey"
            columns: ["einvoice_id"]
            isOneToOne: false
            referencedRelation: "einvoices"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoice_settings: {
        Row: {
          api_url: string | null
          created_at: string
          default_invoice_type: string | null
          default_serial: string | null
          default_template_code: string | null
          id: string
          last_login_at: string | null
          last_login_error: string | null
          last_login_status: string | null
          manager_id: string
          password: string | null
          tax_code: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          api_url?: string | null
          created_at?: string
          default_invoice_type?: string | null
          default_serial?: string | null
          default_template_code?: string | null
          id?: string
          last_login_at?: string | null
          last_login_error?: string | null
          last_login_status?: string | null
          manager_id: string
          password?: string | null
          tax_code?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          api_url?: string | null
          created_at?: string
          default_invoice_type?: string | null
          default_serial?: string | null
          default_template_code?: string | null
          id?: string
          last_login_at?: string | null
          last_login_error?: string | null
          last_login_status?: string | null
          manager_id?: string
          password?: string | null
          tax_code?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      einvoices: {
        Row: {
          adjusted_by_uuid: string | null
          adjustment_type: string | null
          adjusts_uuid: string | null
          buyer_name: string | null
          buyer_tax_code: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          contract_id: string | null
          created_at: string
          draft_payload: Json | null
          email_sent_at: string | null
          email_sent_to: string | null
          error_code: string | null
          id: string
          invoice_action: string | null
          invoice_number: string | null
          invoice_series: string | null
          invoice_type: string | null
          is_draft: boolean
          issued_date: string | null
          last_synced_at: string | null
          manager_id: string | null
          original_invoice_id: string | null
          payment_status_synced: boolean | null
          pdf_url: string | null
          replaced_by_uuid: string | null
          replaces_uuid: string | null
          request_data: Json | null
          reservation_code: string | null
          response_data: Json | null
          status: string
          template_code: string | null
          tenant_id: string
          total_amount: number | null
          total_with_vat: number | null
          transaction_uuid: string | null
          updated_at: string
          vat_amount: number | null
          xml_url: string | null
        }
        Insert: {
          adjusted_by_uuid?: string | null
          adjustment_type?: string | null
          adjusts_uuid?: string | null
          buyer_name?: string | null
          buyer_tax_code?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          contract_id?: string | null
          created_at?: string
          draft_payload?: Json | null
          email_sent_at?: string | null
          email_sent_to?: string | null
          error_code?: string | null
          id?: string
          invoice_action?: string | null
          invoice_number?: string | null
          invoice_series?: string | null
          invoice_type?: string | null
          is_draft?: boolean
          issued_date?: string | null
          last_synced_at?: string | null
          manager_id?: string | null
          original_invoice_id?: string | null
          payment_status_synced?: boolean | null
          pdf_url?: string | null
          replaced_by_uuid?: string | null
          replaces_uuid?: string | null
          request_data?: Json | null
          reservation_code?: string | null
          response_data?: Json | null
          status?: string
          template_code?: string | null
          tenant_id?: string
          total_amount?: number | null
          total_with_vat?: number | null
          transaction_uuid?: string | null
          updated_at?: string
          vat_amount?: number | null
          xml_url?: string | null
        }
        Update: {
          adjusted_by_uuid?: string | null
          adjustment_type?: string | null
          adjusts_uuid?: string | null
          buyer_name?: string | null
          buyer_tax_code?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          contract_id?: string | null
          created_at?: string
          draft_payload?: Json | null
          email_sent_at?: string | null
          email_sent_to?: string | null
          error_code?: string | null
          id?: string
          invoice_action?: string | null
          invoice_number?: string | null
          invoice_series?: string | null
          invoice_type?: string | null
          is_draft?: boolean
          issued_date?: string | null
          last_synced_at?: string | null
          manager_id?: string | null
          original_invoice_id?: string | null
          payment_status_synced?: boolean | null
          pdf_url?: string | null
          replaced_by_uuid?: string | null
          replaces_uuid?: string | null
          request_data?: Json | null
          reservation_code?: string | null
          response_data?: Json | null
          status?: string
          template_code?: string | null
          tenant_id?: string
          total_amount?: number | null
          total_with_vat?: number | null
          transaction_uuid?: string | null
          updated_at?: string
          vat_amount?: number | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "einvoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoices_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "einvoices"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          permission_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          permission_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          permission_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      employee_social_insurance_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          calculation_type: string
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          employee_amount: number
          id: string
          reason: string
          source_reference: string
          status: string
          tenant_id: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          calculation_type?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from: string
          effective_to?: string | null
          employee_amount: number
          id?: string
          reason: string
          source_reference: string
          status?: string
          tenant_id?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          calculation_type?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from?: string
          effective_to?: string | null
          employee_amount?: number
          id?: string
          reason?: string
          source_reference?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_social_insurance_versions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          expense_code: string
          expense_date: string
          id: string
          manager_id: string | null
          person_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description: string
          expense_code: string
          expense_date?: string
          id?: string
          manager_id?: string | null
          person_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          expense_code?: string
          expense_date?: string
          id?: string
          manager_id?: string | null
          person_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fabric_inventory: {
        Row: {
          created_at: string
          current_stock: number
          fabric_variant_id: string
          id: string
          last_updated: string
          manager_id: string | null
          maximum_stock: number | null
          minimum_stock: number | null
          packages_count: number | null
          reserved_stock: number
          tenant_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          current_stock?: number
          fabric_variant_id: string
          id?: string
          last_updated?: string
          manager_id?: string | null
          maximum_stock?: number | null
          minimum_stock?: number | null
          packages_count?: number | null
          reserved_stock?: number
          tenant_id?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          current_stock?: number
          fabric_variant_id?: string
          id?: string
          last_updated?: string
          manager_id?: string | null
          maximum_stock?: number | null
          minimum_stock?: number | null
          packages_count?: number | null
          reserved_stock?: number
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabric_inventory_fabric_variant_id_fkey"
            columns: ["fabric_variant_id"]
            isOneToOne: false
            referencedRelation: "fabric_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabric_inventory_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      fabric_transactions: {
        Row: {
          created_at: string
          fabric_variant_id: string
          id: string
          manager_id: string | null
          notes: string | null
          packages_count: number | null
          quantity: number
          recipient_name: string | null
          reference_number: string | null
          supplier_name: string | null
          tenant_id: string
          total_amount: number | null
          transaction_date: string
          transaction_type: string
          transfer_reference_id: string | null
          unit_price: number | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          fabric_variant_id: string
          id?: string
          manager_id?: string | null
          notes?: string | null
          packages_count?: number | null
          quantity: number
          recipient_name?: string | null
          reference_number?: string | null
          supplier_name?: string | null
          tenant_id?: string
          total_amount?: number | null
          transaction_date?: string
          transaction_type: string
          transfer_reference_id?: string | null
          unit_price?: number | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          fabric_variant_id?: string
          id?: string
          manager_id?: string | null
          notes?: string | null
          packages_count?: number | null
          quantity?: number
          recipient_name?: string | null
          reference_number?: string | null
          supplier_name?: string | null
          tenant_id?: string
          total_amount?: number | null
          transaction_date?: string
          transaction_type?: string
          transfer_reference_id?: string | null
          unit_price?: number | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabric_transactions_fabric_variant_id_fkey"
            columns: ["fabric_variant_id"]
            isOneToOne: false
            referencedRelation: "fabric_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabric_transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      fabric_transfers: {
        Row: {
          approved_by: string | null
          created_at: string
          fabric_variant_id: string
          from_warehouse_id: string
          id: string
          manager_id: string | null
          notes: string | null
          quantity: number
          received_by: string | null
          status: string
          tenant_id: string
          to_warehouse_id: string
          transfer_date: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          fabric_variant_id: string
          from_warehouse_id: string
          id?: string
          manager_id?: string | null
          notes?: string | null
          quantity: number
          received_by?: string | null
          status?: string
          tenant_id?: string
          to_warehouse_id: string
          transfer_date?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          fabric_variant_id?: string
          from_warehouse_id?: string
          id?: string
          manager_id?: string | null
          notes?: string | null
          quantity?: number
          received_by?: string | null
          status?: string
          tenant_id?: string
          to_warehouse_id?: string
          transfer_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabric_transfers_fabric_variant_id_fkey"
            columns: ["fabric_variant_id"]
            isOneToOne: false
            referencedRelation: "fabric_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabric_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabric_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      fabric_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          manager_id: string | null
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fabric_usage: {
        Row: {
          created_at: string
          customer_code: string | null
          customer_name: string | null
          fabric_variant_id: string
          fabric_width: string | null
          id: string
          manager_id: string | null
          notes: string | null
          order_id: string
          order_number: string | null
          order_type: string | null
          quantity_used: number
          tenant_id: string
          unit: string
          updated_at: string
          usage_date: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          customer_code?: string | null
          customer_name?: string | null
          fabric_variant_id: string
          fabric_width?: string | null
          id?: string
          manager_id?: string | null
          notes?: string | null
          order_id: string
          order_number?: string | null
          order_type?: string | null
          quantity_used?: number
          tenant_id?: string
          unit?: string
          updated_at?: string
          usage_date?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          customer_code?: string | null
          customer_name?: string | null
          fabric_variant_id?: string
          fabric_width?: string | null
          id?: string
          manager_id?: string | null
          notes?: string | null
          order_id?: string
          order_number?: string | null
          order_type?: string | null
          quantity_used?: number
          tenant_id?: string
          unit?: string
          updated_at?: string
          usage_date?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabric_usage_fabric_variant_id_fkey"
            columns: ["fabric_variant_id"]
            isOneToOne: false
            referencedRelation: "fabric_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabric_usage_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      fabric_variants: {
        Row: {
          color: string | null
          cost_price: number | null
          created_at: string
          fabric_type_id: string
          fabric_width_id: string | null
          id: string
          manager_id: string | null
          origin: string | null
          selling_price: number | null
          tenant_id: string
          unit: string
          updated_at: string
          variant_name: string
          weight: string | null
          width_code: string | null
        }
        Insert: {
          color?: string | null
          cost_price?: number | null
          created_at?: string
          fabric_type_id: string
          fabric_width_id?: string | null
          id?: string
          manager_id?: string | null
          origin?: string | null
          selling_price?: number | null
          tenant_id?: string
          unit?: string
          updated_at?: string
          variant_name: string
          weight?: string | null
          width_code?: string | null
        }
        Update: {
          color?: string | null
          cost_price?: number | null
          created_at?: string
          fabric_type_id?: string
          fabric_width_id?: string | null
          id?: string
          manager_id?: string | null
          origin?: string | null
          selling_price?: number | null
          tenant_id?: string
          unit?: string
          updated_at?: string
          variant_name?: string
          weight?: string | null
          width_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fabric_variants_fabric_type_id_fkey"
            columns: ["fabric_type_id"]
            isOneToOne: false
            referencedRelation: "fabric_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabric_variants_fabric_width_id_fkey"
            columns: ["fabric_width_id"]
            isOneToOne: false
            referencedRelation: "fabric_widths"
            referencedColumns: ["id"]
          },
        ]
      }
      fabric_widths: {
        Row: {
          created_at: string
          description: string | null
          id: string
          manager_id: string | null
          tenant_id: string
          updated_at: string
          width_code: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          tenant_id?: string
          updated_at?: string
          width_code: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          tenant_id?: string
          updated_at?: string
          width_code?: string
        }
        Relationships: []
      }
      factory_attendance_daily_closure_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_sequence: number
          id: string
          idempotency_key: string
          reason: string | null
          status: string
          tenant_id: string
          work_date: string
          worker_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          idempotency_key: string
          reason?: string | null
          status: string
          tenant_id?: string
          work_date: string
          worker_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          idempotency_key?: string
          reason?: string | null
          status?: string
          tenant_id?: string
          work_date?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_attendance_daily_closure_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_attendance_day_status_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_sequence: number
          id: string
          idempotency_key: string
          meal_eligible: boolean
          reason: string | null
          status: string
          tenant_id: string
          work_date: string
          worker_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          idempotency_key: string
          meal_eligible?: boolean
          reason?: string | null
          status: string
          tenant_id?: string
          work_date: string
          worker_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          idempotency_key?: string
          meal_eligible?: boolean
          reason?: string | null
          status?: string
          tenant_id?: string
          work_date?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_attendance_day_status_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_attendance_records: {
        Row: {
          activity_name: string | null
          attendance_method: string
          break_minutes: number
          calculated_amount: number
          check_in_time: string | null
          check_out_time: string | null
          compensation_type: string
          cost_classification: string
          created_at: string
          created_by: string | null
          day_units: number
          formula_basis: string
          id: string
          idempotency_key: string
          is_estimated: boolean
          notes: string | null
          output_quantity: number
          rate_amount: number
          rate_id: string
          standard_hours_per_day: number | null
          tenant_id: string
          work_date: string
          work_hours: number
          worker_id: string
        }
        Insert: {
          activity_name?: string | null
          attendance_method: string
          break_minutes?: number
          calculated_amount: number
          check_in_time?: string | null
          check_out_time?: string | null
          compensation_type: string
          cost_classification: string
          created_at?: string
          created_by?: string | null
          day_units?: number
          formula_basis: string
          id?: string
          idempotency_key: string
          is_estimated?: boolean
          notes?: string | null
          output_quantity?: number
          rate_amount: number
          rate_id: string
          standard_hours_per_day?: number | null
          tenant_id?: string
          work_date?: string
          work_hours?: number
          worker_id: string
        }
        Update: {
          activity_name?: string | null
          attendance_method?: string
          break_minutes?: number
          calculated_amount?: number
          check_in_time?: string | null
          check_out_time?: string | null
          compensation_type?: string
          cost_classification?: string
          created_at?: string
          created_by?: string | null
          day_units?: number
          formula_basis?: string
          id?: string
          idempotency_key?: string
          is_estimated?: boolean
          notes?: string | null
          output_quantity?: number
          rate_amount?: number
          rate_id?: string
          standard_hours_per_day?: number | null
          tenant_id?: string
          work_date?: string
          work_hours?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_attendance_records_rate_id_fkey"
            columns: ["rate_id"]
            isOneToOne: false
            referencedRelation: "worker_compensation_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_attendance_records_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_attendance_reversals: {
        Row: {
          attendance_record_id: string
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          reason: string
          reversed_amount: number
          tenant_id: string
          work_date: string
          worker_id: string
        }
        Insert: {
          attendance_record_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          reason: string
          reversed_amount: number
          tenant_id?: string
          work_date: string
          worker_id: string
        }
        Update: {
          attendance_record_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          reason?: string
          reversed_amount?: number
          tenant_id?: string
          work_date?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_attendance_reversals_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: true
            referencedRelation: "factory_attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_attendance_reversals_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_attendance_workflow_events: {
        Row: {
          actor_id: string | null
          attendance_record_id: string
          created_at: string
          event_sequence: number
          id: string
          idempotency_key: string
          reason: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          attendance_record_id: string
          created_at?: string
          event_sequence?: never
          id?: string
          idempotency_key: string
          reason?: string | null
          status: string
          tenant_id?: string
        }
        Update: {
          actor_id?: string | null
          attendance_record_id?: string
          created_at?: string
          event_sequence?: never
          id?: string
          idempotency_key?: string
          reason?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_attendance_workflow_events_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "factory_attendance_records"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_overtime_records: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          overtime_minutes: number
          overtime_type: string
          reason: string
          tenant_id: string
          work_date: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          overtime_minutes: number
          overtime_type: string
          reason: string
          tenant_id?: string
          work_date: string
          worker_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          overtime_minutes?: number
          overtime_type?: string
          reason?: string
          tenant_id?: string
          work_date?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_overtime_records_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_overtime_workflow_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_sequence: number
          id: string
          idempotency_key: string
          overtime_record_id: string
          reason: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          idempotency_key: string
          overtime_record_id: string
          reason?: string | null
          status: string
          tenant_id?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          idempotency_key?: string
          overtime_record_id?: string
          reason?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_overtime_workflow_events_overtime_record_id_fkey"
            columns: ["overtime_record_id"]
            isOneToOne: false
            referencedRelation: "factory_overtime_records"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_data: {
        Row: {
          amount: number
          created_at: string
          date: string
          description: string | null
          id: string
          manager_id: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          tenant_id?: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ghn_tracking: {
        Row: {
          cod_amount: number | null
          created_at: string
          created_date: string | null
          customer_address: string | null
          customer_name: string | null
          customer_name_raw: string | null
          customer_phone: string | null
          delivered_date: string | null
          expected_delivery_date: string | null
          ghn_order_code: string
          ghn_status: string | null
          ghn_status_text: string | null
          id: string
          internal_order_code: string | null
          last_updated_at: string | null
          manager_id: string | null
          order_id: string | null
          package_weight: number | null
          raw_data: Json | null
          tenant_id: string
          tracking_notes: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          cod_amount?: number | null
          created_at?: string
          created_date?: string | null
          customer_address?: string | null
          customer_name?: string | null
          customer_name_raw?: string | null
          customer_phone?: string | null
          delivered_date?: string | null
          expected_delivery_date?: string | null
          ghn_order_code: string
          ghn_status?: string | null
          ghn_status_text?: string | null
          id?: string
          internal_order_code?: string | null
          last_updated_at?: string | null
          manager_id?: string | null
          order_id?: string | null
          package_weight?: number | null
          raw_data?: Json | null
          tenant_id?: string
          tracking_notes?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          cod_amount?: number | null
          created_at?: string
          created_date?: string | null
          customer_address?: string | null
          customer_name?: string | null
          customer_name_raw?: string | null
          customer_phone?: string | null
          delivered_date?: string | null
          expected_delivery_date?: string | null
          ghn_order_code?: string
          ghn_status?: string | null
          ghn_status_text?: string | null
          id?: string
          internal_order_code?: string | null
          last_updated_at?: string | null
          manager_id?: string | null
          order_id?: string | null
          package_weight?: number | null
          raw_data?: Json | null
          tenant_id?: string
          tracking_notes?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghn_tracking_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ghn_tracking_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "payment_summary"
            referencedColumns: ["order_id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          actor_id: string | null
          business_key: string
          completed_at: string | null
          first_seen_at: string
          id: string
          operation_type: string
          payload_hash: string
          result_entity_id: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          business_key: string
          completed_at?: string | null
          first_seen_at?: string
          id?: string
          operation_type: string
          payload_hash: string
          result_entity_id?: string | null
          status?: string
          tenant_id?: string
        }
        Update: {
          actor_id?: string | null
          business_key?: string
          completed_at?: string | null
          first_seen_at?: string
          id?: string
          operation_type?: string
          payload_hash?: string
          result_entity_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      inventory_balances: {
        Row: {
          average_unit_cost: number
          id: string
          inventory_item_id: string
          inventory_value: number
          last_movement_at: string | null
          last_movement_sequence: number | null
          location_id: string | null
          quantity_on_hand: number
          tenant_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          average_unit_cost?: number
          id?: string
          inventory_item_id: string
          inventory_value?: number
          last_movement_at?: string | null
          last_movement_sequence?: number | null
          location_id?: string | null
          quantity_on_hand?: number
          tenant_id?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          average_unit_cost?: number
          id?: string
          inventory_item_id?: string
          inventory_value?: number
          last_movement_at?: string | null
          last_movement_sequence?: number | null
          location_id?: string | null
          quantity_on_hand?: number
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_document_lines: {
        Row: {
          adjustment_direction: string | null
          cost_center_id: string | null
          cost_object_id: string | null
          created_at: string
          description: string | null
          document_id: string
          id: string
          input_subtotal: number
          input_total: number
          input_unit_cost: number | null
          inventory_item_id: string
          line_number: number
          location_id: string | null
          posted_total_cost: number | null
          posted_unit_cost: number | null
          quantity: number
          source_movement_id: string | null
          tenant_id: string
          to_location_id: string | null
          unit: string
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          adjustment_direction?: string | null
          cost_center_id?: string | null
          cost_object_id?: string | null
          created_at?: string
          description?: string | null
          document_id: string
          id?: string
          input_subtotal?: number
          input_total?: number
          input_unit_cost?: number | null
          inventory_item_id: string
          line_number: number
          location_id?: string | null
          posted_total_cost?: number | null
          posted_unit_cost?: number | null
          quantity: number
          source_movement_id?: string | null
          tenant_id?: string
          to_location_id?: string | null
          unit: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          adjustment_direction?: string | null
          cost_center_id?: string | null
          cost_object_id?: string | null
          created_at?: string
          description?: string | null
          document_id?: string
          id?: string
          input_subtotal?: number
          input_total?: number
          input_unit_cost?: number | null
          inventory_item_id?: string
          line_number?: number
          location_id?: string | null
          posted_total_cost?: number | null
          posted_unit_cost?: number | null
          quantity?: number
          source_movement_id?: string | null
          tenant_id?: string
          to_location_id?: string | null
          unit?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_document_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_document_lines_cost_object_id_fkey"
            columns: ["cost_object_id"]
            isOneToOne: false
            referencedRelation: "cost_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_document_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "inventory_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_document_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_document_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_document_lines_source_movement_fkey"
            columns: ["source_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_document_lines_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_documents: {
        Row: {
          business_transaction_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          counterparty_name_snapshot: string | null
          created_at: string
          created_by: string | null
          description: string
          document_number: string
          document_type: string
          external_reference: string | null
          id: string
          idempotency_key: string
          manager_id: string | null
          production_order_id: string | null
          reason: string | null
          status: string
          subtotal: number
          tenant_id: string
          to_warehouse_id: string | null
          total_amount: number
          transaction_at: string
          updated_at: string
          vat_amount: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          business_transaction_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          counterparty_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          document_number: string
          document_type: string
          external_reference?: string | null
          id?: string
          idempotency_key: string
          manager_id?: string | null
          production_order_id?: string | null
          reason?: string | null
          status?: string
          subtotal?: number
          tenant_id?: string
          to_warehouse_id?: string | null
          total_amount?: number
          transaction_at?: string
          updated_at?: string
          vat_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          business_transaction_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          counterparty_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          document_number?: string
          document_type?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string
          manager_id?: string | null
          production_order_id?: string | null
          reason?: string | null
          status?: string
          subtotal?: number
          tenant_id?: string
          to_warehouse_id?: string | null
          total_amount?: number
          transaction_at?: string
          updated_at?: string
          vat_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_documents_business_transaction_id_fkey"
            columns: ["business_transaction_id"]
            isOneToOne: true
            referencedRelation: "business_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_documents_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_documents_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_documents_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          base_unit: string
          category: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          item_type: string
          legacy_source_id: string | null
          legacy_source_type: string | null
          manager_id: string | null
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_unit: string
          category?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_type: string
          legacy_source_id?: string | null
          legacy_source_type?: string | null
          manager_id?: string | null
          name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          base_unit?: string
          category?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_type?: string
          legacy_source_id?: string | null
          legacy_source_type?: string | null
          manager_id?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          document_line_id: string
          id: string
          inventory_item_id: string
          location_id: string | null
          movement_kind: string
          movement_sequence: number
          quantity_delta: number
          running_average_cost: number
          running_inventory_value: number
          running_quantity: number
          source_id: string | null
          source_movement_id: string | null
          source_type: string | null
          tenant_id: string
          transaction_at: string
          unit: string
          unit_cost: number
          value_delta: number
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          document_line_id: string
          id?: string
          inventory_item_id: string
          location_id?: string | null
          movement_kind: string
          movement_sequence?: never
          quantity_delta: number
          running_average_cost: number
          running_inventory_value: number
          running_quantity: number
          source_id?: string | null
          source_movement_id?: string | null
          source_type?: string | null
          tenant_id?: string
          transaction_at: string
          unit: string
          unit_cost: number
          value_delta: number
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          document_line_id?: string
          id?: string
          inventory_item_id?: string
          location_id?: string | null
          movement_kind?: string
          movement_sequence?: never
          quantity_delta?: number
          running_average_cost?: number
          running_inventory_value?: number
          running_quantity?: number
          source_id?: string | null
          source_movement_id?: string | null
          source_type?: string | null
          tenant_id?: string
          transaction_at?: string
          unit?: string
          unit_cost?: number
          value_delta?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "inventory_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_document_line_id_fkey"
            columns: ["document_line_id"]
            isOneToOne: false
            referencedRelation: "inventory_document_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_source_movement_id_fkey"
            columns: ["source_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chat_history: {
        Row: {
          answer: string
          created_at: string
          id: string
          manager_id: string | null
          question: string
          sources: Json | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          manager_id?: string | null
          question: string
          sources?: Json | null
          tenant_id?: string
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          manager_id?: string | null
          question?: string
          sources?: Json | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_documents: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          document_type: string
          faq_answer: string | null
          file_url: string | null
          id: string
          manager_id: string | null
          search_vector: unknown
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string
          faq_answer?: string | null
          file_url?: string | null
          id?: string
          manager_id?: string | null
          search_vector?: unknown
          tenant_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string
          faq_answer?: string | null
          file_url?: string | null
          id?: string
          manager_id?: string | null
          search_vector?: unknown
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      labor_cost_entries: {
        Row: {
          accepted_quantity: number
          calculated_amount: number
          compensation_type: string
          cost_category_id: string
          cost_center_id: string | null
          cost_classification: string
          cost_object_id: string | null
          created_at: string
          created_by: string | null
          fact_date: string
          formula_basis: string
          id: string
          is_estimated: boolean
          labor_fact_id: string
          minutes: number
          production_order_id: string
          production_order_operation_id: string
          quantity: number
          rate_amount: number
          rate_id: string
          tenant_id: string
          worker_id: string
        }
        Insert: {
          accepted_quantity: number
          calculated_amount: number
          compensation_type: string
          cost_category_id: string
          cost_center_id?: string | null
          cost_classification: string
          cost_object_id?: string | null
          created_at?: string
          created_by?: string | null
          fact_date: string
          formula_basis: string
          id?: string
          is_estimated?: boolean
          labor_fact_id: string
          minutes: number
          production_order_id: string
          production_order_operation_id: string
          quantity: number
          rate_amount: number
          rate_id: string
          tenant_id?: string
          worker_id: string
        }
        Update: {
          accepted_quantity?: number
          calculated_amount?: number
          compensation_type?: string
          cost_category_id?: string
          cost_center_id?: string | null
          cost_classification?: string
          cost_object_id?: string | null
          created_at?: string
          created_by?: string | null
          fact_date?: string
          formula_basis?: string
          id?: string
          is_estimated?: boolean
          labor_fact_id?: string
          minutes?: number
          production_order_id?: string
          production_order_operation_id?: string
          quantity?: number
          rate_amount?: number
          rate_id?: string
          tenant_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_cost_entries_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_cost_entries_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_cost_entries_cost_object_id_fkey"
            columns: ["cost_object_id"]
            isOneToOne: false
            referencedRelation: "cost_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_cost_entries_labor_fact_id_fkey"
            columns: ["labor_fact_id"]
            isOneToOne: true
            referencedRelation: "production_operation_labor_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_cost_entries_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_cost_entries_production_order_operation_id_fkey"
            columns: ["production_order_operation_id"]
            isOneToOne: false
            referencedRelation: "production_order_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_cost_entries_rate_id_fkey"
            columns: ["rate_id"]
            isOneToOne: false
            referencedRelation: "worker_compensation_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_cost_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requirement_calculations: {
        Row: {
          bom_version_id: string
          calculation_engine_version: string
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          input_snapshot: Json
          output_snapshot: Json
          product_id: string
          quantity: number
          tenant_id: string
          warehouse_id: string | null
        }
        Insert: {
          bom_version_id: string
          calculation_engine_version: string
          created_at?: string
          created_by?: string | null
          effective_date: string
          id?: string
          input_snapshot: Json
          output_snapshot: Json
          product_id: string
          quantity: number
          tenant_id?: string
          warehouse_id?: string | null
        }
        Update: {
          bom_version_id?: string
          calculation_engine_version?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          input_snapshot?: Json
          output_snapshot?: Json
          product_id?: string
          quantity?: number
          tenant_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_requirement_calculations_bom_version_id_fkey"
            columns: ["bom_version_id"]
            isOneToOne: false
            referencedRelation: "bom_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirement_calculations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirement_calculations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirement_calculations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          created_at: string
          id: string
          installment_number: number | null
          manager_id: string | null
          notes: string | null
          order_id: string
          payment_amount: number
          payment_date: string
          payment_method: string | null
          payment_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          installment_number?: number | null
          manager_id?: string | null
          notes?: string | null
          order_id: string
          payment_amount: number
          payment_date?: string
          payment_method?: string | null
          payment_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          installment_number?: number | null
          manager_id?: string | null
          notes?: string | null
          order_id?: string
          payment_amount?: number
          payment_date?: string
          payment_method?: string | null
          payment_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "payment_summary"
            referencedColumns: ["order_id"]
          },
        ]
      }
      orders: {
        Row: {
          assignee_id: string | null
          cost_price: number | null
          created_at: string
          customer_id: string | null
          delivered_date: string | null
          delivery_date: string | null
          display_order_number: string | null
          id: string
          items: Json | null
          manager_id: string | null
          notes: string | null
          order_number: string
          payment_date: string | null
          payment_status: string | null
          profit_after: number | null
          profit_before: number | null
          quote_id: string | null
          status: string
          tenant_id: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          cost_price?: number | null
          created_at?: string
          customer_id?: string | null
          delivered_date?: string | null
          delivery_date?: string | null
          display_order_number?: string | null
          id?: string
          items?: Json | null
          manager_id?: string | null
          notes?: string | null
          order_number: string
          payment_date?: string | null
          payment_status?: string | null
          profit_after?: number | null
          profit_before?: number | null
          quote_id?: string | null
          status?: string
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          cost_price?: number | null
          created_at?: string
          customer_id?: string | null
          delivered_date?: string | null
          delivery_date?: string | null
          display_order_number?: string | null
          id?: string
          items?: Json | null
          manager_id?: string | null
          notes?: string | null
          order_number?: string
          payment_date?: string | null
          payment_status?: string | null
          profit_after?: number | null
          profit_before?: number | null
          quote_id?: string | null
          status?: string
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "assignees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_logs: {
        Row: {
          admin_user_id: string
          created_at: string
          id: string
          reset_type: string
          target_user_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          id?: string
          reset_type: string
          target_user_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          id?: string
          reset_type?: string
          target_user_id?: string
        }
        Relationships: []
      }
      payroll_policy_groups: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_team_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          reason: string
          retired_at: string | null
          retired_by: string | null
          status: string
          supervisor_worker_id: string
          tenant_id: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          reason: string
          retired_at?: string | null
          retired_by?: string | null
          status?: string
          supervisor_worker_id: string
          tenant_id?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          reason?: string
          retired_at?: string | null
          retired_by?: string | null
          status?: string
          supervisor_worker_id?: string
          tenant_id?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_team_assignments_supervisor_worker_id_fkey"
            columns: ["supervisor_worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_team_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          created_at: string
          id: string
          manager_id: string | null
          name: string
          status: string
          tenant_id: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          manager_id?: string | null
          name: string
          status?: string
          tenant_id?: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          manager_id?: string | null
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      product_manufacturing_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          default_bom_id: string | null
          default_cutting_profile_id: string | null
          dimension_unit: string
          extra_dimensions: Json
          finished_height: number | null
          finished_length: number | null
          finished_width: number | null
          id: string
          is_active: boolean
          manufacturing_type: string
          product_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_bom_id?: string | null
          default_cutting_profile_id?: string | null
          dimension_unit?: string
          extra_dimensions?: Json
          finished_height?: number | null
          finished_length?: number | null
          finished_width?: number | null
          id?: string
          is_active?: boolean
          manufacturing_type: string
          product_id: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_bom_id?: string | null
          default_cutting_profile_id?: string | null
          dimension_unit?: string
          extra_dimensions?: Json
          finished_height?: number | null
          finished_length?: number | null
          finished_width?: number | null
          id?: string
          is_active?: boolean
          manufacturing_type?: string
          product_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_manufacturing_profiles_default_bom_fkey"
            columns: ["default_bom_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_manufacturing_profiles_default_cutting_profile_fkey"
            columns: ["default_cutting_profile_id"]
            isOneToOne: false
            referencedRelation: "cutting_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_manufacturing_profiles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_manufacturing_profiles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_piece_rate_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          id: string
          product_id: string
          rate: number
          reason: string
          source_reference: string | null
          status: string
          tenant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          product_id: string
          rate: number
          reason: string
          source_reference?: string | null
          status?: string
          tenant_id?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          product_id?: string
          rate?: number
          reason?: string
          source_reference?: string | null
          status?: string
          tenant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_piece_rate_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_piece_rate_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      production_attendance_reversals: {
        Row: {
          created_at: string
          created_by: string | null
          fact_date: string
          id: string
          idempotency_key: string
          labor_cost_entry_id: string | null
          labor_fact_id: string
          production_order_id: string
          production_order_operation_id: string
          reason: string
          reversed_amount: number
          tenant_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fact_date: string
          id?: string
          idempotency_key: string
          labor_cost_entry_id?: string | null
          labor_fact_id: string
          production_order_id: string
          production_order_operation_id: string
          reason: string
          reversed_amount: number
          tenant_id?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fact_date?: string
          id?: string
          idempotency_key?: string
          labor_cost_entry_id?: string | null
          labor_fact_id?: string
          production_order_id?: string
          production_order_operation_id?: string
          reason?: string
          reversed_amount?: number
          tenant_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_attendance_reversa_production_order_operation_i_fkey"
            columns: ["production_order_operation_id"]
            isOneToOne: false
            referencedRelation: "production_order_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_attendance_reversals_labor_cost_entry_id_fkey"
            columns: ["labor_cost_entry_id"]
            isOneToOne: true
            referencedRelation: "labor_cost_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_attendance_reversals_labor_fact_id_fkey"
            columns: ["labor_fact_id"]
            isOneToOne: true
            referencedRelation: "production_operation_labor_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_attendance_reversals_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_attendance_reversals_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_batches: {
        Row: {
          batch_number: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          planned_quantity: number
          production_order_id: string
          started_at: string | null
          status: string
          team_id: string | null
        }
        Insert: {
          batch_number: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          planned_quantity: number
          production_order_id: string
          started_at?: string | null
          status?: string
          team_id?: string | null
        }
        Update: {
          batch_number?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          planned_quantity?: number
          production_order_id?: string
          started_at?: string | null
          status?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_batches_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          calculated_amount_snapshot: number
          created_at: string
          created_by: string | null
          currency_code_snapshot: string
          formula_basis: string
          id: string
          idempotency_key: string
          notes: string | null
          product_id: string
          product_name_snapshot: string
          product_rate_version_id: string
          product_sku_snapshot: string
          production_order_operation_id: string | null
          quantity: number
          rate_amount_snapshot: number
          rate_unit_snapshot: string
          rejected_at: string | null
          rejected_by: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          tenant_id: string
          work_date: string
          worker_id: string
          workflow_actor_id: string | null
          workflow_at: string
          workflow_reason: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          calculated_amount_snapshot: number
          created_at?: string
          created_by?: string | null
          currency_code_snapshot?: string
          formula_basis?: string
          id?: string
          idempotency_key: string
          notes?: string | null
          product_id: string
          product_name_snapshot: string
          product_rate_version_id: string
          product_sku_snapshot: string
          production_order_operation_id?: string | null
          quantity: number
          rate_amount_snapshot: number
          rate_unit_snapshot: string
          rejected_at?: string | null
          rejected_by?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          tenant_id?: string
          work_date: string
          worker_id: string
          workflow_actor_id?: string | null
          workflow_at?: string
          workflow_reason?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          calculated_amount_snapshot?: number
          created_at?: string
          created_by?: string | null
          currency_code_snapshot?: string
          formula_basis?: string
          id?: string
          idempotency_key?: string
          notes?: string | null
          product_id?: string
          product_name_snapshot?: string
          product_rate_version_id?: string
          product_sku_snapshot?: string
          production_order_operation_id?: string | null
          quantity?: number
          rate_amount_snapshot?: number
          rate_unit_snapshot?: string
          rejected_at?: string | null
          rejected_by?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          tenant_id?: string
          work_date?: string
          worker_id?: string
          workflow_actor_id?: string | null
          workflow_at?: string
          workflow_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_product_rate_version_id_fkey"
            columns: ["product_rate_version_id"]
            isOneToOne: false
            referencedRelation: "product_piece_rate_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_production_order_operation_id_fkey"
            columns: ["production_order_operation_id"]
            isOneToOne: false
            referencedRelation: "production_order_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_entry_workflow_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_sequence: number
          id: string
          idempotency_key: string
          production_entry_id: string
          reason: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          idempotency_key: string
          production_entry_id: string
          reason?: string | null
          status: string
          tenant_id?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_sequence?: never
          id?: string
          idempotency_key?: string
          production_entry_id?: string
          reason?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_entry_workflow_events_production_entry_id_fkey"
            columns: ["production_entry_id"]
            isOneToOne: false
            referencedRelation: "production_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      production_fabric_allocations: {
        Row: {
          consumed_quantity: number
          created_at: string
          fabric_variant_id: string | null
          id: string
          inventory_item_id: string | null
          issued_quantity: number
          production_batch_id: string | null
          production_order_id: string
          received_quantity: number
          reserved_quantity: number
          returned_quantity: number
          scrap_quantity: number
          warehouse_id: string | null
        }
        Insert: {
          consumed_quantity?: number
          created_at?: string
          fabric_variant_id?: string | null
          id?: string
          inventory_item_id?: string | null
          issued_quantity?: number
          production_batch_id?: string | null
          production_order_id: string
          received_quantity?: number
          reserved_quantity?: number
          returned_quantity?: number
          scrap_quantity?: number
          warehouse_id?: string | null
        }
        Update: {
          consumed_quantity?: number
          created_at?: string
          fabric_variant_id?: string | null
          id?: string
          inventory_item_id?: string | null
          issued_quantity?: number
          production_batch_id?: string | null
          production_order_id?: string
          received_quantity?: number
          reserved_quantity?: number
          returned_quantity?: number
          scrap_quantity?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_fabric_allocations_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_fabric_allocations_production_batch_id_fkey"
            columns: ["production_batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_fabric_allocations_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_operation_labor_facts: {
        Row: {
          accepted_quantity: number
          calculated_amount: number
          compensation_type: string
          cost_classification: string
          created_at: string
          created_by: string | null
          fact_date: string
          formula_basis: string
          id: string
          idempotency_key: string
          is_estimated: boolean
          minutes: number
          monthly_productive_minutes: number | null
          notes: string | null
          production_order_id: string
          production_order_operation_id: string
          quantity: number
          rate_amount: number
          rate_id: string
          source_log_id: string | null
          tenant_id: string
          worker_id: string
        }
        Insert: {
          accepted_quantity?: number
          calculated_amount: number
          compensation_type: string
          cost_classification: string
          created_at?: string
          created_by?: string | null
          fact_date?: string
          formula_basis: string
          id?: string
          idempotency_key: string
          is_estimated?: boolean
          minutes?: number
          monthly_productive_minutes?: number | null
          notes?: string | null
          production_order_id: string
          production_order_operation_id: string
          quantity?: number
          rate_amount: number
          rate_id: string
          source_log_id?: string | null
          tenant_id?: string
          worker_id: string
        }
        Update: {
          accepted_quantity?: number
          calculated_amount?: number
          compensation_type?: string
          cost_classification?: string
          created_at?: string
          created_by?: string | null
          fact_date?: string
          formula_basis?: string
          id?: string
          idempotency_key?: string
          is_estimated?: boolean
          minutes?: number
          monthly_productive_minutes?: number | null
          notes?: string | null
          production_order_id?: string
          production_order_operation_id?: string
          quantity?: number
          rate_amount?: number
          rate_id?: string
          source_log_id?: string | null
          tenant_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_operation_labor_fa_production_order_operation_i_fkey"
            columns: ["production_order_operation_id"]
            isOneToOne: false
            referencedRelation: "production_order_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_operation_labor_facts_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_operation_labor_facts_rate_id_fkey"
            columns: ["rate_id"]
            isOneToOne: false
            referencedRelation: "worker_compensation_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_operation_labor_facts_source_log_id_fkey"
            columns: ["source_log_id"]
            isOneToOne: false
            referencedRelation: "production_operation_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_operation_labor_facts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_operation_logs: {
        Row: {
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          ended_at: string | null
          event_type: string
          id: string
          notes: string | null
          production_order_operation_id: string
          quantity: number | null
          reason_code: string | null
          started_at: string | null
          tenant_id: string
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          event_type: string
          id?: string
          notes?: string | null
          production_order_operation_id: string
          quantity?: number | null
          reason_code?: string | null
          started_at?: string | null
          tenant_id?: string
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          event_type?: string
          id?: string
          notes?: string | null
          production_order_operation_id?: string
          quantity?: number | null
          reason_code?: string | null
          started_at?: string | null
          tenant_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_operation_logs_production_order_operation_id_fkey"
            columns: ["production_order_operation_id"]
            isOneToOne: false
            referencedRelation: "production_order_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_operation_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_items: {
        Row: {
          color: string | null
          completed_quantity: number
          created_at: string
          dimensions: string | null
          fabric_variant_id: string | null
          id: string
          planned_quantity: number
          product_id: string
          production_order_id: string
          size: string | null
          source_order_item_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          completed_quantity?: number
          created_at?: string
          dimensions?: string | null
          fabric_variant_id?: string | null
          id?: string
          planned_quantity: number
          product_id: string
          production_order_id: string
          size?: string | null
          source_order_item_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          completed_quantity?: number
          created_at?: string
          dimensions?: string | null
          fabric_variant_id?: string | null
          id?: string
          planned_quantity?: number
          product_id?: string
          production_order_id?: string
          size?: string | null
          source_order_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_items_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_material_requirements: {
        Row: {
          bom_line_id: string | null
          bom_version_id: string
          calculation_details: Json
          created_at: string
          cutting_profile_version_id: string | null
          id: string
          inventory_item_id: string
          planned_quantity: number
          production_order_id: string
          requirement_method: string
          standard_material_cost_preview: number | null
          standard_quantity: number
          standard_unit_cost_snapshot: number | null
          tenant_id: string
          unit: string
          waste_quantity_standard: number
        }
        Insert: {
          bom_line_id?: string | null
          bom_version_id: string
          calculation_details?: Json
          created_at?: string
          cutting_profile_version_id?: string | null
          id?: string
          inventory_item_id: string
          planned_quantity: number
          production_order_id: string
          requirement_method: string
          standard_material_cost_preview?: number | null
          standard_quantity: number
          standard_unit_cost_snapshot?: number | null
          tenant_id?: string
          unit: string
          waste_quantity_standard?: number
        }
        Update: {
          bom_line_id?: string | null
          bom_version_id?: string
          calculation_details?: Json
          created_at?: string
          cutting_profile_version_id?: string | null
          id?: string
          inventory_item_id?: string
          planned_quantity?: number
          production_order_id?: string
          requirement_method?: string
          standard_material_cost_preview?: number | null
          standard_quantity?: number
          standard_unit_cost_snapshot?: number | null
          tenant_id?: string
          unit?: string
          waste_quantity_standard?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_order_material_requi_cutting_profile_version_id_fkey"
            columns: ["cutting_profile_version_id"]
            isOneToOne: false
            referencedRelation: "cutting_profile_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_material_requirements_bom_line_id_fkey"
            columns: ["bom_line_id"]
            isOneToOne: false
            referencedRelation: "bom_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_material_requirements_bom_version_id_fkey"
            columns: ["bom_version_id"]
            isOneToOne: false
            referencedRelation: "bom_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_material_requirements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_material_requirements_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_operations: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          cost_center_id: string | null
          created_at: string
          id: string
          is_optional: boolean
          operation_code: string
          operation_name: string
          operation_qr_code: string | null
          planned_end: string | null
          planned_start: string | null
          production_order_id: string
          quantity_good: number
          quantity_input: number
          quantity_rework: number
          quantity_scrap: number
          sequence: number
          standard_run_minutes_per_unit: number
          standard_setup_minutes: number
          standard_total_minutes: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          cost_center_id?: string | null
          created_at?: string
          id?: string
          is_optional?: boolean
          operation_code: string
          operation_name: string
          operation_qr_code?: string | null
          planned_end?: string | null
          planned_start?: string | null
          production_order_id: string
          quantity_good?: number
          quantity_input?: number
          quantity_rework?: number
          quantity_scrap?: number
          sequence: number
          standard_run_minutes_per_unit?: number
          standard_setup_minutes?: number
          standard_total_minutes: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          cost_center_id?: string | null
          created_at?: string
          id?: string
          is_optional?: boolean
          operation_code?: string
          operation_name?: string
          operation_qr_code?: string | null
          planned_end?: string | null
          planned_start?: string | null
          production_order_id?: string
          quantity_good?: number
          quantity_input?: number
          quantity_rework?: number
          quantity_scrap?: number
          sequence?: number
          standard_run_minutes_per_unit?: number
          standard_setup_minutes?: number
          standard_total_minutes?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_order_operations_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_operations_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_worker_assignments: {
        Row: {
          assigned_from: string
          assigned_to: string | null
          created_at: string
          created_by: string | null
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          notes: string | null
          production_order_id: string
          production_order_operation_id: string | null
          source: string
          tenant_id: string
          worker_id: string
        }
        Insert: {
          assigned_from: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          production_order_id: string
          production_order_operation_id?: string | null
          source?: string
          tenant_id?: string
          worker_id: string
        }
        Update: {
          assigned_from?: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          production_order_id?: string
          production_order_operation_id?: string | null
          source?: string
          tenant_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_order_worker_assig_production_order_operation_i_fkey"
            columns: ["production_order_operation_id"]
            isOneToOne: false
            referencedRelation: "production_order_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_worker_assignments_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_worker_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          actual_end_at: string | null
          actual_start_at: string | null
          attendance_assignment_enforced: boolean
          bom_version_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          completed_by: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          cutting_params_snapshot: Json
          id: string
          material_issue_tolerance_percent: number
          order_id: string | null
          planned_end_date: string | null
          planned_start_date: string | null
          product_id: string
          production_batch_number: string
          production_order_number: string
          qr_token: string
          quantity_good: number
          quantity_planned: number
          quantity_rework: number
          quantity_scrap: number
          released_at: string | null
          released_by: string | null
          routing_version_id: string | null
          source_id: string | null
          source_type: string
          standard_minutes_total: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          attendance_assignment_enforced?: boolean
          bom_version_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          cutting_params_snapshot?: Json
          id?: string
          material_issue_tolerance_percent?: number
          order_id?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          product_id: string
          production_batch_number: string
          production_order_number: string
          qr_token?: string
          quantity_good?: number
          quantity_planned: number
          quantity_rework?: number
          quantity_scrap?: number
          released_at?: string | null
          released_by?: string | null
          routing_version_id?: string | null
          source_id?: string | null
          source_type?: string
          standard_minutes_total?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          attendance_assignment_enforced?: boolean
          bom_version_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          cutting_params_snapshot?: Json
          id?: string
          material_issue_tolerance_percent?: number
          order_id?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          product_id?: string
          production_batch_number?: string
          production_order_number?: string
          qr_token?: string
          quantity_good?: number
          quantity_planned?: number
          quantity_rework?: number
          quantity_scrap?: number
          released_at?: string | null
          released_by?: string | null
          routing_version_id?: string | null
          source_id?: string | null
          source_type?: string
          standard_minutes_total?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_bom_version_id_fkey"
            columns: ["bom_version_id"]
            isOneToOne: false
            referencedRelation: "bom_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "payment_summary"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_routing_version_id_fkey"
            columns: ["routing_version_id"]
            isOneToOne: false
            referencedRelation: "routing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_outputs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inventory_receipt_id: string | null
          output_date: string
          product_id: string
          production_order_id: string
          quantity_good: number
          quantity_scrap: number
          status: string
          tenant_id: string
          valuation_status: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_receipt_id?: string | null
          output_date?: string
          product_id: string
          production_order_id: string
          quantity_good: number
          quantity_scrap?: number
          status?: string
          tenant_id?: string
          valuation_status?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_receipt_id?: string | null
          output_date?: string
          product_id?: string
          production_order_id?: string
          quantity_good?: number
          quantity_scrap?: number
          status?: string
          tenant_id?: string
          valuation_status?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_outputs_inventory_receipt_id_fkey"
            columns: ["inventory_receipt_id"]
            isOneToOne: false
            referencedRelation: "inventory_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_outputs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_outputs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_outputs_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: true
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_outputs_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      production_rework_records: {
        Row: {
          created_at: string
          created_by: string | null
          from_operation_id: string | null
          id: string
          notes: string | null
          production_order_id: string
          quantity: number
          reason_code: string
          target_operation_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_operation_id?: string | null
          id?: string
          notes?: string | null
          production_order_id: string
          quantity: number
          reason_code: string
          target_operation_id?: string | null
          tenant_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_operation_id?: string | null
          id?: string
          notes?: string | null
          production_order_id?: string
          quantity?: number
          reason_code?: string
          target_operation_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_rework_records_from_operation_id_fkey"
            columns: ["from_operation_id"]
            isOneToOne: false
            referencedRelation: "production_order_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_rework_records_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_rework_records_target_operation_id_fkey"
            columns: ["target_operation_id"]
            isOneToOne: false
            referencedRelation: "production_order_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      production_scrap_records: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          production_order_id: string
          production_order_operation_id: string | null
          quantity: number
          reason_code: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          production_order_id: string
          production_order_operation_id?: string | null
          quantity: number
          reason_code: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          production_order_id?: string
          production_order_operation_id?: string | null
          quantity?: number
          reason_code?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_scrap_records_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_scrap_records_production_order_operation_id_fkey"
            columns: ["production_order_operation_id"]
            isOneToOne: false
            referencedRelation: "production_order_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      production_stage_events: {
        Row: {
          approved_by: string | null
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          minutes_worked: number | null
          notes: string | null
          occurred_at: string
          order_item_id: string | null
          production_batch_id: string | null
          production_order_id: string
          quantity_defect: number
          quantity_good: number
          quantity_received: number
          quantity_remake: number
          quantity_rework: number
          stage: string
          status: string
          team_id: string | null
          worker_id: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          minutes_worked?: number | null
          notes?: string | null
          occurred_at?: string
          order_item_id?: string | null
          production_batch_id?: string | null
          production_order_id: string
          quantity_defect?: number
          quantity_good?: number
          quantity_received?: number
          quantity_remake?: number
          quantity_rework?: number
          stage: string
          status?: string
          team_id?: string | null
          worker_id?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          minutes_worked?: number | null
          notes?: string | null
          occurred_at?: string
          order_item_id?: string | null
          production_batch_id?: string | null
          production_order_id?: string
          quantity_defect?: number
          quantity_good?: number
          quantity_received?: number
          quantity_remake?: number
          quantity_rework?: number
          stage?: string
          status?: string
          team_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_stage_events_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "production_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stage_events_production_batch_id_fkey"
            columns: ["production_batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stage_events_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_stage_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_workers: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          employee_code: string
          employment_end_date: string | null
          employment_start_date: string | null
          employment_type: string | null
          id: string
          is_active: boolean
          location_code: string | null
          payroll_status: string
          position_title: string | null
          primary_cost_center_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
          worker_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          employee_code: string
          employment_end_date?: string | null
          employment_start_date?: string | null
          employment_type?: string | null
          id?: string
          is_active?: boolean
          location_code?: string | null
          payroll_status?: string
          position_title?: string | null
          primary_cost_center_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          worker_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          employee_code?: string
          employment_end_date?: string | null
          employment_start_date?: string | null
          employment_type?: string | null
          id?: string
          is_active?: boolean
          location_code?: string | null
          payroll_status?: string
          position_title?: string | null
          primary_cost_center_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          worker_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_workers_primary_cost_center_id_fkey"
            columns: ["primary_cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          images: Json | null
          in_stock: boolean | null
          manager_id: string | null
          name: string
          price: number | null
          price_list_id: string | null
          sku: string | null
          specifications: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: Json | null
          in_stock?: boolean | null
          manager_id?: string | null
          name: string
          price?: number | null
          price_list_id?: string | null
          sku?: string | null
          specifications?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: Json | null
          in_stock?: boolean | null
          manager_id?: string | null
          name?: string
          price?: number | null
          price_list_id?: string | null
          sku?: string | null
          specifications?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quote_template_settings: {
        Row: {
          address: string | null
          bank_info: string | null
          company_name: string | null
          company_title: string | null
          company_title_color: string | null
          created_at: string | null
          footer_note: string | null
          headquarters: string | null
          id: string
          logo_url: string | null
          phone: string | null
          quote_title_color: string | null
          signature_position: Json | null
          signature_url: string | null
          stamp_position: Json | null
          stamp_url: string | null
          tax_code: string | null
          tenant_id: string | null
          terms: Json | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          bank_info?: string | null
          company_name?: string | null
          company_title?: string | null
          company_title_color?: string | null
          created_at?: string | null
          footer_note?: string | null
          headquarters?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          quote_title_color?: string | null
          signature_position?: Json | null
          signature_url?: string | null
          stamp_position?: Json | null
          stamp_url?: string | null
          tax_code?: string | null
          tenant_id?: string | null
          terms?: Json | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          bank_info?: string | null
          company_name?: string | null
          company_title?: string | null
          company_title_color?: string | null
          created_at?: string | null
          footer_note?: string | null
          headquarters?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          quote_title_color?: string | null
          signature_position?: Json | null
          signature_url?: string | null
          stamp_position?: Json | null
          stamp_url?: string | null
          tax_code?: string | null
          tenant_id?: string | null
          terms?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          assignee_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          include_vat: boolean | null
          items: Json | null
          manager_id: string | null
          notes: string | null
          price_list_id: string | null
          quote_data: Json | null
          quote_number: string
          status: string
          subtotal: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          include_vat?: boolean | null
          items?: Json | null
          manager_id?: string | null
          notes?: string | null
          price_list_id?: string | null
          quote_data?: Json | null
          quote_number: string
          status?: string
          subtotal?: number | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          include_vat?: boolean | null
          items?: Json | null
          manager_id?: string | null
          notes?: string | null
          price_list_id?: string | null
          quote_data?: Json | null
          quote_number?: string
          status?: string
          subtotal?: number | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "assignees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_headers: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          product_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          product_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          product_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_headers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_headers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_operations: {
        Row: {
          cost_center_id: string | null
          created_at: string
          id: string
          is_optional: boolean
          labor_skill: string | null
          machine_type: string | null
          operation_code: string
          operation_name: string
          quantity_basis: string
          routing_version_id: string
          sequence: number
          setup_minutes: number
          standard_minutes_per_unit: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cost_center_id?: string | null
          created_at?: string
          id?: string
          is_optional?: boolean
          labor_skill?: string | null
          machine_type?: string | null
          operation_code: string
          operation_name: string
          quantity_basis?: string
          routing_version_id: string
          sequence: number
          setup_minutes?: number
          standard_minutes_per_unit: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          cost_center_id?: string | null
          created_at?: string
          id?: string
          is_optional?: boolean
          labor_skill?: string | null
          machine_type?: string | null
          operation_code?: string
          operation_name?: string
          quantity_basis?: string
          routing_version_id?: string
          sequence?: number
          setup_minutes?: number
          standard_minutes_per_unit?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_operations_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_operations_routing_version_id_fkey"
            columns: ["routing_version_id"]
            isOneToOne: false
            referencedRelation: "routing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_versions: {
        Row: {
          approval_reason: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          notes: string | null
          routing_id: string
          status: string
          tenant_id: string
          updated_at: string
          version_number: number
        }
        Insert: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          routing_id: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version_number: number
        }
        Update: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          routing_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "routing_versions_routing_id_fkey"
            columns: ["routing_id"]
            isOneToOne: false
            referencedRelation: "routing_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_companies: {
        Row: {
          address: string | null
          areas: string[] | null
          contact_person: string | null
          created_at: string
          google_maps_url: string | null
          id: string
          manager_id: string | null
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          areas?: string[] | null
          contact_person?: string | null
          created_at?: string
          google_maps_url?: string | null
          id?: string
          manager_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          areas?: string[] | null
          contact_person?: string | null
          created_at?: string
          google_maps_url?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      transaction_types: {
        Row: {
          can_create_asset: boolean
          can_create_cost: boolean
          code: string
          created_at: string
          default_cost_behavior: string | null
          default_cost_category_id: string | null
          default_cost_center_id: string | null
          default_direction: string
          default_effect_kind: string
          default_traceability: string | null
          description: string | null
          has_cash_impact: boolean
          has_inventory_impact: boolean
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          requires_cost_center: boolean
          requires_cost_object: boolean
          requires_counterparty: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          can_create_asset?: boolean
          can_create_cost?: boolean
          code: string
          created_at?: string
          default_cost_behavior?: string | null
          default_cost_category_id?: string | null
          default_cost_center_id?: string | null
          default_direction?: string
          default_effect_kind?: string
          default_traceability?: string | null
          description?: string | null
          has_cash_impact?: boolean
          has_inventory_impact?: boolean
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          requires_cost_center?: boolean
          requires_cost_object?: boolean
          requires_counterparty?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          can_create_asset?: boolean
          can_create_cost?: boolean
          code?: string
          created_at?: string
          default_cost_behavior?: string | null
          default_cost_category_id?: string | null
          default_cost_center_id?: string | null
          default_direction?: string
          default_effect_kind?: string
          default_traceability?: string | null
          description?: string | null
          has_cash_impact?: boolean
          has_inventory_impact?: boolean
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          requires_cost_center?: boolean
          requires_cost_object?: boolean
          requires_counterparty?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_types_default_cost_category_id_fkey"
            columns: ["default_cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_types_default_cost_center_id_fkey"
            columns: ["default_cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          date: string
          description: string | null
          id: string
          installment_number: number | null
          manager_id: string | null
          order_id: string | null
          payment_type: string | null
          remaining_amount: number | null
          tenant_id: string
          total_installments: number | null
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          installment_number?: number | null
          manager_id?: string | null
          order_id?: string | null
          payment_type?: string | null
          remaining_amount?: number | null
          tenant_id?: string
          total_installments?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          installment_number?: number | null
          manager_id?: string | null
          order_id?: string | null
          payment_type?: string | null
          remaining_amount?: number | null
          tenant_id?: string
          total_installments?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "payment_summary"
            referencedColumns: ["order_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouse_locations: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          parent_id: string | null
          tenant_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          tenant_id: string
          updated_at: string
          warehouse_type: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          tenant_id?: string
          updated_at?: string
          warehouse_type?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string
          warehouse_type?: string
        }
        Relationships: []
      }
      worker_compensation_assignments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          compensation_type: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          payroll_policy_group_id: string
          reason: string
          status: string
          tenant_id: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          compensation_type: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          payroll_policy_group_id: string
          reason: string
          status?: string
          tenant_id?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          compensation_type?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          payroll_policy_group_id?: string
          reason?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_compensation_assignments_payroll_policy_group_id_fkey"
            columns: ["payroll_policy_group_id"]
            isOneToOne: false
            referencedRelation: "payroll_policy_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_compensation_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_compensation_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          currency_code: string
          default_compensation_type: string
          id: string
          is_active: boolean
          monthly_productive_minutes: number | null
          tenant_id: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency_code?: string
          default_compensation_type: string
          id?: string
          is_active?: boolean
          monthly_productive_minutes?: number | null
          tenant_id?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency_code?: string
          default_compensation_type?: string
          id?: string
          is_active?: boolean
          monthly_productive_minutes?: number | null
          tenant_id?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_compensation_profiles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_compensation_rates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          compensation_type: string
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          hourly_rate: number | null
          id: string
          is_estimated: boolean
          monthly_productive_minutes: number | null
          monthly_rate: number | null
          piece_rate: number | null
          reason: string | null
          source_reference: string | null
          status: string
          tenant_id: string
          unit_basis: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          compensation_type: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from: string
          effective_to?: string | null
          hourly_rate?: number | null
          id?: string
          is_estimated?: boolean
          monthly_productive_minutes?: number | null
          monthly_rate?: number | null
          piece_rate?: number | null
          reason?: string | null
          source_reference?: string | null
          status?: string
          tenant_id?: string
          unit_basis?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          compensation_type?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          effective_from?: string
          effective_to?: string | null
          hourly_rate?: number | null
          id?: string
          is_estimated?: boolean
          monthly_productive_minutes?: number | null
          monthly_rate?: number | null
          piece_rate?: number | null
          reason?: string | null
          source_reference?: string | null
          status?: string
          tenant_id?: string
          unit_basis?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_compensation_rates_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "production_workers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      einvoice_settings_public: {
        Row: {
          api_url: string | null
          created_at: string | null
          default_invoice_type: string | null
          default_serial: string | null
          default_template_code: string | null
          has_password: boolean | null
          id: string | null
          last_login_at: string | null
          last_login_error: string | null
          last_login_status: string | null
          manager_id: string | null
          tax_code: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          api_url?: string | null
          created_at?: string | null
          default_invoice_type?: string | null
          default_serial?: string | null
          default_template_code?: string | null
          has_password?: never
          id?: string | null
          last_login_at?: string | null
          last_login_error?: string | null
          last_login_status?: string | null
          manager_id?: string | null
          tax_code?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          api_url?: string | null
          created_at?: string | null
          default_invoice_type?: string | null
          default_serial?: string | null
          default_template_code?: string | null
          has_password?: never
          id?: string | null
          last_login_at?: string | null
          last_login_error?: string | null
          last_login_status?: string | null
          manager_id?: string | null
          tax_code?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      payment_summary: {
        Row: {
          customer_code: string | null
          customer_name: string | null
          final_payment_date: string | null
          first_payment_date: string | null
          last_payment_date: string | null
          order_id: string | null
          order_number: string | null
          payment_count: number | null
          payment_status: string | null
          remaining_amount: number | null
          total_amount: number | null
          total_paid: number | null
        }
        Relationships: []
      }
      production_order_material_variance: {
        Row: {
          actual_consumption_quantity: number | null
          actual_material_cost: number | null
          current_stock: number | null
          inventory_item_id: string | null
          issued_quantity: number | null
          planned_quantity: number | null
          production_order_id: string | null
          quantity_variance: number | null
          returned_quantity: number | null
          standard_quantity: number | null
          tenant_id: string | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_order_material_requirements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_material_requirements_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products_public: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          images: Json | null
          in_stock: boolean | null
          manager_id: string | null
          name: string | null
          price: number | null
          price_list_id: string | null
          sku: string | null
          specifications: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          images?: Json | null
          in_stock?: boolean | null
          manager_id?: string | null
          name?: string | null
          price?: number | null
          price_list_id?: string | null
          sku?: string | null
          specifications?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          images?: Json | null
          in_stock?: boolean | null
          manager_id?: string | null
          name?: string | null
          price?: number | null
          price_list_id?: string | null
          sku?: string | null
          specifications?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_inventory_movement: {
        Args: {
          p_document_id: string
          p_inbound_unit_cost?: number
          p_line_id: string
          p_location_id: string
          p_movement_kind: string
          p_quantity_delta: number
          p_source_movement_id?: string
          p_warehouse_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          document_id: string
          document_line_id: string
          id: string
          inventory_item_id: string
          location_id: string | null
          movement_kind: string
          movement_sequence: number
          quantity_delta: number
          running_average_cost: number
          running_inventory_value: number
          running_quantity: number
          source_id: string | null
          source_movement_id: string | null
          source_type: string | null
          tenant_id: string
          transaction_at: string
          unit: string
          unit_cost: number
          value_delta: number
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_movements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_bom_version: {
        Args: {
          p_reason?: string
          p_supersede_previous?: boolean
          p_version_id: string
        }
        Returns: Json
      }
      approve_cutting_profile_version: {
        Args: {
          p_reason?: string
          p_supersede_previous?: boolean
          p_version_id: string
        }
        Returns: Json
      }
      approve_product_piece_rate: {
        Args: {
          p_rate_version_id: string
          p_reason: string
          p_supersede_previous?: boolean
        }
        Returns: Json
      }
      approve_routing_version: {
        Args: {
          p_reason?: string
          p_supersede_previous?: boolean
          p_version_id: string
        }
        Returns: Json
      }
      approve_social_insurance_version: {
        Args: {
          p_reason: string
          p_supersede_previous?: boolean
          p_version_id: string
        }
        Returns: Json
      }
      approve_worker_compensation_assignment: {
        Args: {
          p_assignment_id: string
          p_reason: string
          p_supersede_previous?: boolean
        }
        Returns: Json
      }
      approve_worker_payroll_rate: {
        Args: {
          p_rate_id: string
          p_reason: string
          p_supersede_previous?: boolean
        }
        Returns: Json
      }
      assign_production_order_worker: {
        Args: {
          p_assigned_from?: string
          p_assigned_to?: string
          p_notes?: string
          p_production_order_id: string
          p_production_order_operation_id?: string
          p_worker_id: string
        }
        Returns: Json
      }
      calculate_cutting_consumption: {
        Args: {
          p_allow_draft?: boolean
          p_cutting_profile_version_id: string
          p_fabric_width_cm?: number
          p_quantity: number
        }
        Returns: Json
      }
      calculate_production_order_labor_cost: {
        Args: { p_production_order_id: string }
        Returns: Json
      }
      calculate_standard_material_requirements: {
        Args: {
          p_allow_draft?: boolean
          p_bom_version_id?: string
          p_effective_date?: string
          p_product_id: string
          p_quantity: number
          p_save_snapshot?: boolean
          p_warehouse_id?: string
        }
        Returns: Json
      }
      complete_production_operation: {
        Args: {
          p_operation_id: string
          p_quantity_good?: number
          p_quantity_rework?: number
          p_quantity_scrap?: number
          p_worker_id?: string
        }
        Returns: Json
      }
      complete_production_order: {
        Args: {
          p_production_order_id: string
          p_quantity_good: number
          p_quantity_scrap?: number
          p_warehouse_id?: string
        }
        Returns: Json
      }
      configure_worker_attendance_method: {
        Args: {
          p_attendance_method: string
          p_effective_from: string
          p_effective_to?: string
          p_is_estimated?: boolean
          p_rate_amount: number
          p_reason?: string
          p_standard_days_per_month?: number
          p_standard_hours_per_day?: number
          p_worker_id: string
        }
        Returns: Json
      }
      confirm_business_transaction: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      confirm_inventory_document: {
        Args: { p_document_id: string }
        Returns: Json
      }
      cost_target_exists_in_tenant: {
        Args: { p_table_name: string; p_target_id: string; p_tenant_id: string }
        Returns: boolean
      }
      create_bank_account_draft: {
        Args: {
          p_account_name: string
          p_account_number: string
          p_bank_code?: string
          p_bank_name: string
          p_effective_from?: string
          p_effective_to?: string
          p_is_primary?: boolean
          p_reason?: string
          p_source_reference?: string
          p_worker_id: string
        }
        Returns: Json
      }
      create_bom_draft: {
        Args: {
          p_clone_version_id?: string
          p_code: string
          p_name: string
          p_product_id: string
        }
        Returns: Json
      }
      create_business_transaction: {
        Args: {
          p_counterparty_id?: string
          p_counterparty_name?: string
          p_counterparty_type?: string
          p_description: string
          p_external_reference?: string
          p_idempotency_key: string
          p_lines: Json
          p_links?: Json
          p_transaction_date: string
          p_transaction_type_id: string
        }
        Returns: Json
      }
      create_cutting_profile_draft: {
        Args: {
          p_clone_version_id?: string
          p_code: string
          p_manufacturing_type: string
          p_name: string
          p_product_id: string
        }
        Returns: Json
      }
      create_inventory_document: {
        Args: {
          p_business_transaction_id?: string
          p_counterparty_name?: string
          p_description: string
          p_document_type: string
          p_external_reference?: string
          p_idempotency_key: string
          p_lines: Json
          p_production_order_id?: string
          p_reason?: string
          p_to_warehouse_id: string
          p_transaction_at: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      create_payroll_team_assignment: {
        Args: {
          p_effective_from: string
          p_effective_to?: string
          p_reason?: string
          p_supervisor_worker_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      create_product_piece_rate_draft: {
        Args: {
          p_effective_from: string
          p_effective_to?: string
          p_product_id: string
          p_rate: number
          p_reason?: string
          p_source_reference?: string
          p_unit?: string
        }
        Returns: Json
      }
      create_production_order: {
        Args: {
          p_cost_center_id?: string
          p_material_issue_tolerance_percent?: number
          p_order_id?: string
          p_planned_end_date?: string
          p_planned_start_date?: string
          p_product_id: string
          p_quantity: number
          p_source_type?: string
        }
        Returns: Json
      }
      create_production_worker: {
        Args: {
          p_display_name: string
          p_employee_code: string
          p_primary_cost_center_id?: string
          p_user_id?: string
          p_worker_type?: string
        }
        Returns: Json
      }
      create_routing_draft: {
        Args: {
          p_clone_version_id?: string
          p_code: string
          p_name: string
          p_product_id: string
        }
        Returns: Json
      }
      create_social_insurance_draft: {
        Args: {
          p_effective_from: string
          p_effective_to?: string
          p_employee_amount: number
          p_reason?: string
          p_source_reference?: string
          p_worker_id: string
        }
        Returns: Json
      }
      create_worker_compensation_assignment: {
        Args: {
          p_compensation_type: string
          p_effective_from: string
          p_effective_to?: string
          p_payroll_policy_group_id: string
          p_reason?: string
          p_worker_id: string
        }
        Returns: Json
      }
      create_worker_compensation_rate: {
        Args: {
          p_compensation_type: string
          p_effective_from: string
          p_effective_to?: string
          p_hourly_rate?: number
          p_is_estimated?: boolean
          p_monthly_productive_minutes?: number
          p_monthly_rate?: number
          p_piece_rate?: number
          p_reason?: string
          p_worker_id: string
        }
        Returns: Json
      }
      create_worker_payroll_rate_draft: {
        Args: {
          p_compensation_type: string
          p_effective_from: string
          p_effective_to?: string
          p_hourly_rate?: number
          p_is_estimated?: boolean
          p_monthly_productive_minutes?: number
          p_monthly_rate?: number
          p_piece_rate?: number
          p_reason?: string
          p_source_reference?: string
          p_worker_id: string
        }
        Returns: Json
      }
      current_cost_manager_id: { Args: never; Returns: string }
      current_factory_attendance_closure: {
        Args: { p_work_date: string; p_worker_id: string }
        Returns: string
      }
      current_factory_attendance_day_status: {
        Args: { p_work_date: string; p_worker_id: string }
        Returns: Json
      }
      current_factory_attendance_status: {
        Args: { p_record_id: string }
        Returns: string
      }
      current_factory_overtime_status: {
        Args: { p_record_id: string }
        Returns: string
      }
      current_production_entry_status: {
        Args: { p_entry_id: string }
        Returns: string
      }
      discard_bank_account_draft: {
        Args: { p_bank_account_id: string; p_reason: string }
        Returns: Json
      }
      discard_product_piece_rate_draft: {
        Args: { p_rate_version_id: string; p_reason: string }
        Returns: Json
      }
      discard_social_insurance_draft: {
        Args: { p_reason: string; p_version_id: string }
        Returns: Json
      }
      discard_worker_compensation_assignment_draft: {
        Args: { p_assignment_id: string; p_reason: string }
        Returns: Json
      }
      discard_worker_payroll_rate_draft: {
        Args: { p_rate_id: string; p_reason: string }
        Returns: Json
      }
      end_production_order_worker_assignment: {
        Args: {
          p_assigned_to?: string
          p_assignment_id: string
          p_reason?: string
        }
        Returns: Json
      }
      factory_attendance_can_manage_all: { Args: never; Returns: boolean }
      factory_attendance_can_review_worker: {
        Args: { p_on_date: string; p_worker_id: string }
        Returns: boolean
      }
      factory_attendance_fact_is_active: {
        Args: { p_record_id: string }
        Returns: boolean
      }
      factory_attendance_worker_in_scope: {
        Args: { p_on_date?: string; p_worker_id: string }
        Returns: boolean
      }
      factory_overtime_record_is_active: {
        Args: { p_record_id: string }
        Returns: boolean
      }
      generate_production_order_number: { Args: never; Returns: string }
      get_duplicate_display_order_numbers: {
        Args: never
        Returns: {
          display_number: string
          dup_count: number
        }[]
      }
      get_inventory_dashboard_summary: {
        Args: never
        Returns: {
          active_item_count: number
          draft_document_count: number
          stocked_balance_count: number
          total_inventory_value: number
          warehouse_count: number
        }[]
      }
      get_production_labor_variance: {
        Args: { p_production_order_id: string }
        Returns: Json
      }
      get_production_order_variance: {
        Args: { p_production_order_id: string }
        Returns: Json
      }
      get_products_catalog: {
        Args: {
          _category?: string
          _in_stock?: boolean
          _limit?: number
          _offset?: number
          _price_list_id: string
          _search?: string
        }
        Returns: {
          category: string
          created_at: string
          description: string
          id: string
          image_url: string
          images: Json
          in_stock: boolean
          manager_id: string
          name: string
          price: number
          price_list_id: string
          sku: string
          specifications: string
          tenant_id: string
          total_count: number
          updated_at: string
        }[]
      }
      get_products_cost_prices: {
        Args: { _ids: string[] }
        Returns: {
          cost_price: number
          id: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_bom_permission: { Args: { p_permission?: string }; Returns: boolean }
      has_cost_permission: { Args: { p_permission?: string }; Returns: boolean }
      has_payroll_permission: {
        Args: { p_permission?: string }
        Returns: boolean
      }
      has_production_permission: {
        Args: { p_permission?: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      inventory_audit_event_accessible: {
        Args: {
          p_after_data: Json
          p_before_data: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: boolean
      }
      inventory_warehouse_accessible: {
        Args: { p_tenant_id?: string; p_warehouse_id: string }
        Returns: boolean
      }
      list_factory_attendance_closures: {
        Args: { p_month_start: string }
        Returns: {
          created_at: string
          reason: string
          status: string
          work_date: string
          worker_id: string
        }[]
      }
      list_factory_attendance_closures_scope_base: {
        Args: { p_month_start: string }
        Returns: {
          created_at: string
          reason: string
          status: string
          work_date: string
          worker_id: string
        }[]
      }
      list_factory_attendance_day_status_month: {
        Args: { p_month_start: string }
        Returns: {
          created_at: string
          employee_code: string
          meal_eligible: boolean
          reason: string
          status: string
          work_date: string
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_factory_attendance_day_status_month_scope_base: {
        Args: { p_month_start: string }
        Returns: {
          created_at: string
          employee_code: string
          meal_eligible: boolean
          reason: string
          status: string
          work_date: string
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_factory_attendance_month: {
        Args: { p_include_reversed?: boolean; p_month_start: string }
        Returns: {
          activity_name: string
          attendance_method: string
          calculated_amount: number
          cost_classification: string
          cost_visible: boolean
          created_at: string
          day_units: number
          employee_code: string
          id: string
          is_estimated: boolean
          is_reversed: boolean
          notes: string
          operation_code: string
          operation_name: string
          output_quantity: number
          production_order_id: string
          production_order_number: string
          production_order_operation_id: string
          rate_amount: number
          reversal_reason: string
          source_type: string
          work_date: string
          work_hours: number
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_factory_attendance_month_scope_base: {
        Args: { p_include_reversed?: boolean; p_month_start: string }
        Returns: {
          activity_name: string
          attendance_method: string
          calculated_amount: number
          cost_classification: string
          cost_visible: boolean
          created_at: string
          day_units: number
          employee_code: string
          id: string
          is_estimated: boolean
          is_reversed: boolean
          notes: string
          operation_code: string
          operation_name: string
          output_quantity: number
          production_order_id: string
          production_order_number: string
          production_order_operation_id: string
          rate_amount: number
          reversal_reason: string
          source_type: string
          work_date: string
          work_hours: number
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_factory_attendance_month_v2: {
        Args: { p_include_reversed?: boolean; p_month_start: string }
        Returns: {
          activity_name: string
          attendance_method: string
          break_minutes: number
          calculated_amount: number
          check_in_time: string
          check_out_time: string
          cost_classification: string
          cost_visible: boolean
          created_at: string
          day_units: number
          employee_code: string
          id: string
          is_estimated: boolean
          is_reversed: boolean
          notes: string
          operation_code: string
          operation_name: string
          output_quantity: number
          production_order_id: string
          production_order_number: string
          production_order_operation_id: string
          rate_amount: number
          reversal_reason: string
          source_type: string
          work_date: string
          work_hours: number
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_factory_attendance_month_v2_scope_base: {
        Args: { p_include_reversed?: boolean; p_month_start: string }
        Returns: {
          activity_name: string
          attendance_method: string
          break_minutes: number
          calculated_amount: number
          check_in_time: string
          check_out_time: string
          cost_classification: string
          cost_visible: boolean
          created_at: string
          day_units: number
          employee_code: string
          id: string
          is_estimated: boolean
          is_reversed: boolean
          notes: string
          operation_code: string
          operation_name: string
          output_quantity: number
          production_order_id: string
          production_order_number: string
          production_order_operation_id: string
          rate_amount: number
          reversal_reason: string
          source_type: string
          work_date: string
          work_hours: number
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_factory_attendance_month_v3: {
        Args: { p_include_reversed?: boolean; p_month_start: string }
        Returns: {
          activity_name: string
          attendance_method: string
          break_minutes: number
          calculated_amount: number
          check_in_time: string
          check_out_time: string
          closure_status: string
          cost_classification: string
          cost_visible: boolean
          created_at: string
          day_units: number
          employee_code: string
          id: string
          is_estimated: boolean
          is_reversed: boolean
          notes: string
          operation_code: string
          operation_name: string
          output_quantity: number
          production_order_id: string
          production_order_number: string
          production_order_operation_id: string
          rate_amount: number
          reversal_reason: string
          source_type: string
          work_date: string
          work_hours: number
          worker_id: string
          worker_name: string
          worker_type: string
          workflow_at: string
          workflow_reason: string
          workflow_status: string
        }[]
      }
      list_factory_attendance_month_v3_scope_base: {
        Args: { p_include_reversed?: boolean; p_month_start: string }
        Returns: {
          activity_name: string
          attendance_method: string
          break_minutes: number
          calculated_amount: number
          check_in_time: string
          check_out_time: string
          closure_status: string
          cost_classification: string
          cost_visible: boolean
          created_at: string
          day_units: number
          employee_code: string
          id: string
          is_estimated: boolean
          is_reversed: boolean
          notes: string
          operation_code: string
          operation_name: string
          output_quantity: number
          production_order_id: string
          production_order_number: string
          production_order_operation_id: string
          rate_amount: number
          reversal_reason: string
          source_type: string
          work_date: string
          work_hours: number
          worker_id: string
          worker_name: string
          worker_type: string
          workflow_at: string
          workflow_reason: string
          workflow_status: string
        }[]
      }
      list_factory_attendance_workers: {
        Args: never
        Returns: {
          created_at: string
          created_by: string
          display_name: string
          employee_code: string
          id: string
          is_active: boolean
          primary_cost_center_id: string
          tenant_id: string
          updated_at: string
          user_id: string
          worker_type: string
        }[]
      }
      list_factory_overtime_month: {
        Args: { p_month_start: string }
        Returns: {
          created_at: string
          employee_code: string
          id: string
          overtime_minutes: number
          overtime_type: string
          reason: string
          status: string
          work_date: string
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_factory_overtime_month_scope_base: {
        Args: { p_month_start: string }
        Returns: {
          created_at: string
          employee_code: string
          id: string
          overtime_minutes: number
          overtime_type: string
          reason: string
          status: string
          work_date: string
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_inventory_audit_events: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          actor_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reason: string
        }[]
      }
      list_inventory_balances: {
        Args: never
        Returns: {
          average_unit_cost: number
          id: string
          inventory_item_id: string
          inventory_value: number
          item_code: string
          item_name: string
          item_type: string
          last_movement_at: string
          location_id: string
          location_name: string
          quantity_on_hand: number
          unit: string
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      list_inventory_business_transactions: {
        Args: { p_document_type: string }
        Returns: {
          counterparty_name: string
          description: string
          id: string
          total_amount: number
          transaction_date: string
          transaction_number: string
        }[]
      }
      list_inventory_documents: {
        Args: { p_limit?: number }
        Returns: {
          confirmed_at: string
          counterparty_name: string
          created_by: string
          description: string
          document_number: string
          document_type: string
          external_reference: string
          id: string
          production_order_id: string
          production_order_number: string
          status: string
          subtotal: number
          to_warehouse_id: string
          to_warehouse_name: string
          total_amount: number
          transaction_at: string
          vat_amount: number
          void_reason: string
          voided_at: string
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      list_inventory_movements: {
        Args: { p_inventory_item_id?: string; p_limit?: number }
        Returns: {
          created_by: string
          document_id: string
          document_number: string
          id: string
          inventory_item_id: string
          item_code: string
          item_name: string
          movement_kind: string
          movement_sequence: number
          quantity_delta: number
          running_average_cost: number
          running_inventory_value: number
          running_quantity: number
          source_movement_id: string
          transaction_at: string
          unit: string
          unit_cost: number
          value_delta: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      list_inventory_return_sources: {
        Args: never
        Returns: {
          document_number: string
          id: string
          inventory_item_id: string
          location_id: string
          movement_kind: string
          original_quantity: number
          remaining_quantity: number
          returned_quantity: number
          transaction_at: string
          unit: string
          warehouse_id: string
        }[]
      }
      list_inventory_warehouses: {
        Args: never
        Returns: {
          address: string
          id: string
          name: string
          warehouse_type: string
        }[]
      }
      list_payroll_capabilities: {
        Args: never
        Returns: {
          allowed: boolean
          delegable: boolean
          permission_type: string
          source: string
        }[]
      }
      list_payroll_policy_groups: {
        Args: never
        Returns: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payroll_policy_groups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_payroll_products: {
        Args: { p_search?: string }
        Returns: {
          category: string
          current_rate: number
          current_rate_effective_from: string
          current_rate_effective_to: string
          current_rate_id: string
          current_rate_unit: string
          id: string
          in_stock: boolean
          name: string
          sku: string
          specifications: string
        }[]
      }
      list_payroll_products_v2: {
        Args: { p_search?: string }
        Returns: {
          category: string
          current_rate: number
          current_rate_effective_from: string
          current_rate_effective_to: string
          current_rate_id: string
          current_rate_unit: string
          id: string
          in_stock: boolean
          mapping_status: string
          name: string
          price_list_id: string
          price_list_name: string
          price_list_year: number
          sku: string
          sku_match_count: number
          specifications: string
        }[]
      }
      list_payroll_team_assignments: {
        Args: {
          p_on_date?: string
          p_supervisor_worker_id?: string
          p_worker_id?: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          reason: string
          retired_at: string | null
          retired_by: string | null
          status: string
          supervisor_worker_id: string
          tenant_id: string
          updated_at: string
          worker_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payroll_team_assignments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_payroll_workers: {
        Args: { p_include_inactive?: boolean }
        Returns: {
          current_assignment_id: string
          current_compensation_type: string
          current_policy_group_code: string
          current_policy_group_id: string
          display_name: string
          employee_code: string
          employment_end_date: string
          employment_start_date: string
          employment_type: string
          id: string
          is_active: boolean
          location_code: string
          payroll_status: string
          position_title: string
          primary_cost_center_id: string
          user_id: string
          worker_type: string
        }[]
      }
      list_product_piece_rates: {
        Args: { p_product_id?: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          id: string
          product_id: string
          rate: number
          reason: string
          source_reference: string | null
          status: string
          tenant_id: string
          unit: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "product_piece_rate_versions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_production_attendance: {
        Args: { p_production_order_id: string }
        Returns: {
          attendance_method: string
          calculated_amount: number
          cost_classification: string
          cost_visible: boolean
          created_at: string
          day_units: number
          employee_code: string
          id: string
          is_estimated: boolean
          notes: string
          operation_code: string
          operation_name: string
          output_quantity: number
          production_order_id: string
          production_order_operation_id: string
          rate_amount: number
          work_date: string
          work_hours: number
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_production_attendance_month: {
        Args: {
          p_include_reversed?: boolean
          p_month_start: string
          p_production_order_id: string
        }
        Returns: {
          attendance_method: string
          calculated_amount: number
          cost_classification: string
          cost_visible: boolean
          created_at: string
          day_units: number
          employee_code: string
          id: string
          is_estimated: boolean
          is_reversed: boolean
          notes: string
          operation_code: string
          operation_name: string
          output_quantity: number
          production_order_id: string
          production_order_operation_id: string
          rate_amount: number
          reversal_reason: string
          work_date: string
          work_hours: number
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_production_attendance_month_scope_base: {
        Args: {
          p_include_reversed?: boolean
          p_month_start: string
          p_production_order_id: string
        }
        Returns: {
          attendance_method: string
          calculated_amount: number
          cost_classification: string
          cost_visible: boolean
          created_at: string
          day_units: number
          employee_code: string
          id: string
          is_estimated: boolean
          is_reversed: boolean
          notes: string
          operation_code: string
          operation_name: string
          output_quantity: number
          production_order_id: string
          production_order_operation_id: string
          rate_amount: number
          reversal_reason: string
          work_date: string
          work_hours: number
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_production_attendance_scope_base: {
        Args: { p_production_order_id: string }
        Returns: {
          attendance_method: string
          calculated_amount: number
          cost_classification: string
          cost_visible: boolean
          created_at: string
          day_units: number
          employee_code: string
          id: string
          is_estimated: boolean
          notes: string
          operation_code: string
          operation_name: string
          output_quantity: number
          production_order_id: string
          production_order_operation_id: string
          rate_amount: number
          work_date: string
          work_hours: number
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_production_entries_month: {
        Args: { p_include_reversed?: boolean; p_month_start: string }
        Returns: {
          calculated_amount: number
          cost_visible: boolean
          created_at: string
          currency_code: string
          employee_code: string
          id: string
          notes: string
          product_id: string
          product_name: string
          product_sku: string
          production_order_number: string
          production_order_operation_id: string
          quantity: number
          rate_amount: number
          rate_unit: string
          work_date: string
          worker_id: string
          worker_name: string
          worker_type: string
          workflow_actor_id: string
          workflow_at: string
          workflow_reason: string
          workflow_status: string
        }[]
      }
      list_production_entry_products: {
        Args: { p_search?: string; p_work_date?: string }
        Returns: {
          category: string
          id: string
          mapping_status: string
          name: string
          price_list_name: string
          rate: number
          rate_available: boolean
          rate_unit: string
          rate_visible: boolean
          sku: string
        }[]
      }
      list_production_order_worker_assignments: {
        Args: { p_production_order_id: string }
        Returns: {
          assigned_from: string
          assigned_to: string
          employee_code: string
          id: string
          is_active: boolean
          notes: string
          production_order_id: string
          production_order_operation_id: string
          worker_id: string
          worker_name: string
          worker_type: string
        }[]
      }
      list_production_orders_for_issue: {
        Args: never
        Returns: {
          id: string
          product_id: string
          product_name: string
          production_order_number: string
          quantity_planned: number
          status: string
        }[]
      }
      list_social_insurance_versions: {
        Args: { p_worker_id?: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          calculation_type: string
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          employee_amount: number
          id: string
          reason: string
          source_reference: string
          status: string
          tenant_id: string
          updated_at: string
          worker_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "employee_social_insurance_versions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_worker_attendance_methods: {
        Args: never
        Returns: {
          attendance_method: string
          compensation_type: string
          worker_id: string
        }[]
      }
      list_worker_attendance_methods_scope_base: {
        Args: never
        Returns: {
          attendance_method: string
          compensation_type: string
          worker_id: string
        }[]
      }
      list_worker_bank_accounts: {
        Args: { p_worker_id?: string }
        Returns: {
          account_name: string
          account_number: string
          account_number_masked: string
          bank_code: string
          bank_name: string
          created_at: string
          effective_from: string
          effective_to: string
          id: string
          is_primary: boolean
          reason: string
          source_reference: string
          status: string
          verified_at: string
          worker_id: string
        }[]
      }
      list_worker_compensation_assignments: {
        Args: { p_worker_id?: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          compensation_type: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          payroll_policy_group_id: string
          reason: string
          status: string
          tenant_id: string
          updated_at: string
          worker_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "worker_compensation_assignments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_worker_compensation_rates: {
        Args: { p_worker_id?: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          compensation_type: string
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          hourly_rate: number | null
          id: string
          is_estimated: boolean
          monthly_productive_minutes: number | null
          monthly_rate: number | null
          piece_rate: number | null
          reason: string | null
          source_reference: string | null
          status: string
          tenant_id: string
          unit_basis: string
          updated_at: string
          worker_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "worker_compensation_rates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_production_operation: {
        Args: {
          p_ended_at?: string
          p_event_type: string
          p_notes?: string
          p_operation_id: string
          p_quantity?: number
          p_reason_code?: string
          p_started_at?: string
          p_worker_id?: string
        }
        Returns: Json
      }
      mask_bank_account: { Args: { p_account_number: string }; Returns: string }
      next_business_transaction_number: {
        Args: { p_date: string; p_tenant_id: string }
        Returns: string
      }
      next_inventory_document_number: {
        Args: { p_tenant_id: string; p_transaction_at: string }
        Returns: string
      }
      payroll_capability_is_delegable: {
        Args: { p_permission: string }
        Returns: boolean
      }
      payroll_capability_is_known: {
        Args: { p_permission: string }
        Returns: boolean
      }
      payroll_worker_in_scope: {
        Args: { p_worker_id: string }
        Returns: boolean
      }
      payroll_worker_in_scope_at: {
        Args: { p_on_date: string; p_worker_id: string }
        Returns: boolean
      }
      payroll_worker_manageable: {
        Args: { p_worker_id: string }
        Returns: boolean
      }
      payroll_worker_manageable_at: {
        Args: { p_on_date: string; p_worker_id: string }
        Returns: boolean
      }
      production_entry_day_is_open: {
        Args: { p_work_date: string; p_worker_id: string }
        Returns: boolean
      }
      reconcile_inventory_balances: {
        Args: never
        Returns: {
          balance_quantity: number
          balance_value: number
          inventory_item_id: string
          ledger_quantity: number
          ledger_value: number
          location_id: string
          quantity_difference: number
          value_difference: number
          warehouse_id: string
        }[]
      }
      record_fabric_usage_and_transaction: {
        Args: {
          p_customer_code?: string
          p_customer_name?: string
          p_fabric_variant_id: string
          p_fabric_width?: string
          p_notes?: string
          p_order_id: string
          p_order_number: string
          p_order_type?: string
          p_quantity_used: number
          p_usage_date?: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      record_factory_attendance: {
        Args: {
          p_activity_name?: string
          p_attendance_method: string
          p_day_units?: number
          p_idempotency_key?: string
          p_notes?: string
          p_output_quantity?: number
          p_standard_hours_per_day?: number
          p_work_date?: string
          p_work_hours?: number
          p_worker_id: string
        }
        Returns: Json
      }
      record_factory_attendance_hour_guard_base: {
        Args: {
          p_activity_name?: string
          p_attendance_method: string
          p_day_units?: number
          p_idempotency_key?: string
          p_notes?: string
          p_output_quantity?: number
          p_standard_hours_per_day?: number
          p_work_date?: string
          p_work_hours?: number
          p_worker_id: string
        }
        Returns: Json
      }
      record_factory_attendance_scope_base: {
        Args: {
          p_activity_name?: string
          p_attendance_method: string
          p_day_units?: number
          p_idempotency_key?: string
          p_notes?: string
          p_output_quantity?: number
          p_standard_hours_per_day?: number
          p_work_date?: string
          p_work_hours?: number
          p_worker_id: string
        }
        Returns: Json
      }
      record_factory_attendance_v1: {
        Args: {
          p_activity_name?: string
          p_attendance_method: string
          p_day_units?: number
          p_idempotency_key?: string
          p_notes?: string
          p_output_quantity?: number
          p_standard_hours_per_day?: number
          p_work_date?: string
          p_work_hours?: number
          p_worker_id: string
        }
        Returns: Json
      }
      record_factory_attendance_v2: {
        Args: {
          p_activity_name?: string
          p_attendance_method: string
          p_day_units?: number
          p_idempotency_key?: string
          p_notes?: string
          p_output_quantity?: number
          p_standard_hours_per_day?: number
          p_work_date?: string
          p_work_hours?: number
          p_worker_id: string
        }
        Returns: Json
      }
      record_factory_hour_attendance: {
        Args: {
          p_activity_name?: string
          p_break_minutes?: number
          p_check_in_time: string
          p_check_out_time: string
          p_idempotency_key?: string
          p_notes?: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      record_factory_hour_attendance_scope_base: {
        Args: {
          p_activity_name?: string
          p_break_minutes?: number
          p_check_in_time: string
          p_check_out_time: string
          p_idempotency_key?: string
          p_notes?: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      record_factory_hour_attendance_v2: {
        Args: {
          p_activity_name?: string
          p_break_minutes?: number
          p_check_in_time: string
          p_check_out_time: string
          p_idempotency_key?: string
          p_notes?: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      record_factory_overtime: {
        Args: {
          p_idempotency_key: string
          p_overtime_minutes: number
          p_overtime_type: string
          p_reason: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      record_factory_overtime_scope_base: {
        Args: {
          p_idempotency_key: string
          p_overtime_minutes: number
          p_overtime_type: string
          p_reason: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      record_factory_overtime_v1: {
        Args: {
          p_idempotency_key: string
          p_overtime_minutes: number
          p_overtime_type: string
          p_reason: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      record_production_attendance: {
        Args: {
          p_attendance_method: string
          p_day_units?: number
          p_idempotency_key?: string
          p_notes?: string
          p_output_quantity?: number
          p_production_order_operation_id: string
          p_standard_hours_per_day?: number
          p_work_date?: string
          p_work_hours?: number
          p_worker_id: string
        }
        Returns: Json
      }
      record_production_attendance_scope_base: {
        Args: {
          p_attendance_method: string
          p_day_units?: number
          p_idempotency_key?: string
          p_notes?: string
          p_output_quantity?: number
          p_production_order_operation_id: string
          p_standard_hours_per_day?: number
          p_work_date?: string
          p_work_hours?: number
          p_worker_id: string
        }
        Returns: Json
      }
      record_production_entry: {
        Args: {
          p_idempotency_key?: string
          p_notes?: string
          p_product_id: string
          p_production_order_operation_id?: string
          p_quantity: number
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      record_production_labor_fact: {
        Args: {
          p_accepted_quantity?: number
          p_compensation_type?: string
          p_fact_date?: string
          p_idempotency_key?: string
          p_minutes?: number
          p_notes?: string
          p_production_order_operation_id: string
          p_quantity?: number
          p_source_log_id?: string
          p_worker_id: string
        }
        Returns: Json
      }
      record_production_rework: {
        Args: {
          p_from_operation_id?: string
          p_notes?: string
          p_production_order_id: string
          p_quantity: number
          p_reason_code: string
          p_target_operation_id?: string
        }
        Returns: Json
      }
      record_production_scrap: {
        Args: {
          p_notes?: string
          p_operation_id?: string
          p_production_order_id: string
          p_quantity: number
          p_reason_code: string
        }
        Returns: Json
      }
      release_production_order: {
        Args: { p_effective_date?: string; p_production_order_id: string }
        Returns: Json
      }
      replace_employee_permissions: {
        Args: { p_permissions: Json; p_reason?: string; p_user_id: string }
        Returns: Json
      }
      require_default_tenant: { Args: never; Returns: string }
      resolve_cutting_rule_dimension: {
        Args: {
          p_flap_cm: number
          p_height_cm: number
          p_length_cm: number
          p_parameter_cm: number
          p_rule: string
          p_tuck_cm: number
          p_width_cm: number
        }
        Returns: number
      }
      resolve_dimension_cm: {
        Args: { p_unit: string; p_value: number }
        Returns: number
      }
      resolve_effective_bom_version: {
        Args: { p_effective_date?: string; p_product_id: string }
        Returns: string
      }
      resolve_effective_cutting_profile_version: {
        Args: { p_cutting_profile_id: string; p_effective_date?: string }
        Returns: string
      }
      resolve_effective_routing_version: {
        Args: { p_effective_date?: string; p_product_id: string }
        Returns: string
      }
      resolve_payroll_compensation_type: {
        Args: { p_effective_date: string; p_worker_id: string }
        Returns: string
      }
      resolve_primary_bank_account: {
        Args: { p_effective_date: string; p_worker_id: string }
        Returns: {
          account_name: string
          account_number: string
          bank_code: string | null
          bank_name: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_primary: boolean
          reason: string
          source_reference: string | null
          status: string
          tenant_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bank_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_product_piece_rate: {
        Args: { p_product_id: string; p_work_date: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          id: string
          product_id: string
          rate: number
          reason: string
          source_reference: string | null
          status: string
          tenant_id: string
          unit: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "product_piece_rate_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_social_insurance_version: {
        Args: { p_effective_date: string; p_worker_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          calculation_type: string
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          employee_amount: number
          id: string
          reason: string
          source_reference: string
          status: string
          tenant_id: string
          updated_at: string
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "employee_social_insurance_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_worker_compensation_assignment: {
        Args: { p_effective_date: string; p_worker_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          compensation_type: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          payroll_policy_group_id: string
          reason: string
          status: string
          tenant_id: string
          updated_at: string
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "worker_compensation_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_worker_compensation_rate: {
        Args: {
          p_compensation_type: string
          p_fact_date: string
          p_worker_id: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          compensation_type: string
          created_at: string
          created_by: string | null
          currency_code: string
          effective_from: string
          effective_to: string | null
          hourly_rate: number | null
          id: string
          is_estimated: boolean
          monthly_productive_minutes: number | null
          monthly_rate: number | null
          piece_rate: number | null
          reason: string | null
          source_reference: string | null
          status: string
          tenant_id: string
          unit_basis: string
          updated_at: string
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "worker_compensation_rates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      retire_payroll_team_assignment: {
        Args: {
          p_assignment_id: string
          p_effective_to: string
          p_reason: string
        }
        Returns: Json
      }
      reverse_factory_attendance: {
        Args: {
          p_attendance_record_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      reverse_factory_attendance_scope_base: {
        Args: {
          p_attendance_record_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      reverse_factory_attendance_v1: {
        Args: {
          p_attendance_record_id: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: Json
      }
      reverse_production_attendance: {
        Args: {
          p_idempotency_key: string
          p_labor_fact_id: string
          p_reason: string
        }
        Returns: Json
      }
      reverse_production_entry: {
        Args: {
          p_idempotency_key: string
          p_production_entry_id: string
          p_reason: string
        }
        Returns: Json
      }
      save_bom_draft: {
        Args: {
          p_effective_from: string
          p_effective_to: string
          p_lines: Json
          p_notes: string
          p_version_id: string
        }
        Returns: Json
      }
      save_cutting_profile_draft: {
        Args: {
          p_configuration: Json
          p_effective_from: string
          p_effective_to: string
          p_version_id: string
        }
        Returns: Json
      }
      save_product_manufacturing_profile: {
        Args: {
          p_dimension_unit?: string
          p_extra_dimensions?: Json
          p_finished_height?: number
          p_finished_length: number
          p_finished_width: number
          p_is_active?: boolean
          p_manufacturing_type: string
          p_product_id: string
        }
        Returns: Json
      }
      save_routing_draft: {
        Args: {
          p_effective_from: string
          p_effective_to: string
          p_notes: string
          p_operations: Json
          p_version_id: string
        }
        Returns: Json
      }
      set_factory_attendance_day_closure: {
        Args: {
          p_idempotency_key?: string
          p_reason?: string
          p_target_status: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      set_factory_attendance_day_closure_scope_base: {
        Args: {
          p_idempotency_key?: string
          p_reason?: string
          p_target_status: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      set_factory_attendance_day_closure_v1: {
        Args: {
          p_idempotency_key?: string
          p_reason?: string
          p_target_status: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      set_factory_attendance_day_closure_v2: {
        Args: {
          p_idempotency_key?: string
          p_reason?: string
          p_target_status: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      set_factory_attendance_day_status: {
        Args: {
          p_idempotency_key?: string
          p_meal_eligible?: boolean
          p_reason?: string
          p_status: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      set_factory_attendance_day_status_scope_base: {
        Args: {
          p_idempotency_key?: string
          p_meal_eligible?: boolean
          p_reason?: string
          p_status: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      set_factory_attendance_day_status_v1: {
        Args: {
          p_idempotency_key?: string
          p_meal_eligible?: boolean
          p_reason?: string
          p_status: string
          p_work_date: string
          p_worker_id: string
        }
        Returns: Json
      }
      set_factory_attendance_status: {
        Args: {
          p_attendance_record_id: string
          p_idempotency_key?: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      set_factory_attendance_status_review_base: {
        Args: {
          p_attendance_record_id: string
          p_idempotency_key?: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      set_factory_attendance_status_scope_base: {
        Args: {
          p_attendance_record_id: string
          p_idempotency_key?: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      set_factory_attendance_status_team_base: {
        Args: {
          p_attendance_record_id: string
          p_idempotency_key?: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      set_factory_attendance_status_v1: {
        Args: {
          p_attendance_record_id: string
          p_idempotency_key?: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      set_factory_overtime_status: {
        Args: {
          p_idempotency_key?: string
          p_overtime_record_id: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      set_factory_overtime_status_review_base: {
        Args: {
          p_idempotency_key?: string
          p_overtime_record_id: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      set_factory_overtime_status_scope_base: {
        Args: {
          p_idempotency_key?: string
          p_overtime_record_id: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      set_factory_overtime_status_team_base: {
        Args: {
          p_idempotency_key?: string
          p_overtime_record_id: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      set_factory_overtime_status_v1: {
        Args: {
          p_idempotency_key?: string
          p_overtime_record_id: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      set_production_entry_status: {
        Args: {
          p_idempotency_key?: string
          p_production_entry_id: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      set_production_order_assignment_enforcement: {
        Args: {
          p_enforced: boolean
          p_production_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      start_production_operation: {
        Args: { p_operation_id: string; p_worker_id?: string }
        Returns: Json
      }
      sync_worker_compensation_master: {
        Args: { p_on_date?: string; p_worker_id: string }
        Returns: string
      }
      transition_production_order_status: {
        Args: {
          p_production_order_id: string
          p_reason?: string
          p_target_status: string
        }
        Returns: Json
      }
      trigger_ghn_auto_update: { Args: never; Returns: undefined }
      update_bank_account_draft: {
        Args: {
          p_account_name: string
          p_account_number: string
          p_bank_account_id: string
          p_bank_code?: string
          p_bank_name: string
          p_effective_from?: string
          p_effective_to?: string
          p_is_primary?: boolean
          p_reason?: string
          p_source_reference?: string
        }
        Returns: Json
      }
      update_payroll_worker_master: {
        Args: {
          p_employment_end_date?: string
          p_employment_start_date?: string
          p_employment_type?: string
          p_location_code?: string
          p_payroll_status?: string
          p_position_title?: string
          p_reason?: string
          p_worker_id: string
        }
        Returns: Json
      }
      update_product_piece_rate_draft: {
        Args: {
          p_effective_from: string
          p_effective_to?: string
          p_rate: number
          p_rate_version_id: string
          p_reason?: string
          p_source_reference?: string
          p_unit?: string
        }
        Returns: Json
      }
      update_social_insurance_draft: {
        Args: {
          p_effective_from: string
          p_effective_to?: string
          p_employee_amount: number
          p_reason?: string
          p_source_reference?: string
          p_version_id: string
        }
        Returns: Json
      }
      update_worker_compensation_assignment_draft: {
        Args: {
          p_assignment_id: string
          p_compensation_type: string
          p_effective_from: string
          p_effective_to?: string
          p_payroll_policy_group_id: string
          p_reason?: string
        }
        Returns: Json
      }
      update_worker_payroll_rate_draft: {
        Args: {
          p_effective_from: string
          p_effective_to?: string
          p_hourly_rate?: number
          p_is_estimated?: boolean
          p_monthly_productive_minutes?: number
          p_monthly_rate?: number
          p_piece_rate?: number
          p_rate_id: string
          p_reason?: string
          p_source_reference?: string
        }
        Returns: Json
      }
      upsert_payroll_policy_group: {
        Args: {
          p_code: string
          p_description?: string
          p_is_active?: boolean
          p_name: string
          p_reason?: string
        }
        Returns: Json
      }
      upsert_worker_compensation_profile: {
        Args: {
          p_compensation_type: string
          p_monthly_productive_minutes?: number
          p_worker_id: string
        }
        Returns: Json
      }
      validate_inventory_business_transaction: {
        Args: {
          p_business_transaction_id: string
          p_document_type: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      validate_inventory_document_for_confirm: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      verify_bank_account: {
        Args: {
          p_bank_account_id: string
          p_reason: string
          p_supersede_previous?: boolean
        }
        Returns: Json
      }
      void_business_transaction: {
        Args: { p_reason: string; p_transaction_id: string }
        Returns: Json
      }
      void_inventory_document: {
        Args: { p_document_id: string; p_reason: string }
        Returns: Json
      }
      write_cost_audit: {
        Args: {
          p_action: string
          p_after: Json
          p_before: Json
          p_entity_id: string
          p_entity_type: string
          p_reason?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "employee" | "accountant"
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
      app_role: ["admin", "manager", "employee", "accountant"],
    },
  },
} as const
