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
      einvoices: {
        Row: {
          buyer_name: string | null
          buyer_tax_code: string | null
          contract_id: string | null
          created_at: string
          id: string
          invoice_number: string | null
          invoice_series: string | null
          invoice_type: string | null
          issued_date: string | null
          manager_id: string | null
          request_data: Json | null
          response_data: Json | null
          status: string
          template_code: string | null
          tenant_id: string
          total_amount: number | null
          total_with_vat: number | null
          transaction_uuid: string | null
          updated_at: string
          vat_amount: number | null
        }
        Insert: {
          buyer_name?: string | null
          buyer_tax_code?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          invoice_number?: string | null
          invoice_series?: string | null
          invoice_type?: string | null
          issued_date?: string | null
          manager_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status?: string
          template_code?: string | null
          tenant_id?: string
          total_amount?: number | null
          total_with_vat?: number | null
          transaction_uuid?: string | null
          updated_at?: string
          vat_amount?: number | null
        }
        Update: {
          buyer_name?: string | null
          buyer_tax_code?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          invoice_number?: string | null
          invoice_series?: string | null
          invoice_type?: string | null
          issued_date?: string | null
          manager_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status?: string
          template_code?: string | null
          tenant_id?: string
          total_amount?: number | null
          total_with_vat?: number | null
          transaction_uuid?: string | null
          updated_at?: string
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "einvoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
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
    }
    Views: {
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
      get_duplicate_display_order_numbers: {
        Args: never
        Returns: {
          display_number: string
          dup_count: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      trigger_ghn_auto_update: { Args: never; Returns: undefined }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
