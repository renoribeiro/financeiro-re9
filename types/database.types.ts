export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      chart_accounts: {
        Row: { code: string | null; company_id: string; created_at: string; id: string; name: string; parent_id: string | null; type: string }
        Insert: { code?: string | null; company_id: string; created_at?: string; id?: string; name: string; parent_id?: string | null; type: string }
        Update: { code?: string | null; company_id?: string; created_at?: string; id?: string; name?: string; parent_id?: string | null; type?: string }
        Relationships: []
      }
      commission_installments: {
        Row: { amount: number; commission_id: string; expected_date: string | null; id: string; installment_number: number; receivable_id: string | null; received_date: string | null; status: string }
        Insert: { amount?: number; commission_id: string; expected_date?: string | null; id?: string; installment_number?: number; receivable_id?: string | null; received_date?: string | null; status?: string }
        Update: { amount?: number; commission_id?: string; expected_date?: string | null; id?: string; installment_number?: number; receivable_id?: string | null; received_date?: string | null; status?: string }
        Relationships: []
      }
      commission_splits: {
        Row: { amount: number; beneficiary_id: string | null; beneficiary_type: string | null; commission_id: string; id: string; payable_id: string | null; percentage: number | null; status: string }
        Insert: { amount?: number; beneficiary_id?: string | null; beneficiary_type?: string | null; commission_id: string; id?: string; payable_id?: string | null; percentage?: number | null; status?: string }
        Update: { amount?: number; beneficiary_id?: string | null; beneficiary_type?: string | null; commission_id?: string; id?: string; payable_id?: string | null; percentage?: number | null; status?: string }
        Relationships: []
      }
      commissions: {
        Row: { company_id: string; created_at: string; id: string; notes: string | null; receipt_type: string | null; sale_id: string | null; status: string; total_amount: number }
        Insert: { company_id: string; created_at?: string; id?: string; notes?: string | null; receipt_type?: string | null; sale_id?: string | null; status?: string; total_amount?: number }
        Update: { company_id?: string; created_at?: string; id?: string; notes?: string | null; receipt_type?: string | null; sale_id?: string | null; status?: string; total_amount?: number }
        Relationships: []
      }
      companies: {
        Row: { certificate_expiry: string | null; city: string | null; city_ibge: string | null; cnpj: string | null; created_at: string; creci: string | null; id: string; invoice_config: Json; logo_color: string | null; main_cnae: string | null; municipal_registration: string | null; name: string; state: string | null; state_registration: string | null; tax_config: Json; tax_regime: string | null; trade_name: string | null; type: string }
        Insert: { certificate_expiry?: string | null; city?: string | null; city_ibge?: string | null; cnpj?: string | null; created_at?: string; creci?: string | null; id?: string; invoice_config?: Json; logo_color?: string | null; main_cnae?: string | null; municipal_registration?: string | null; name: string; state?: string | null; state_registration?: string | null; tax_config?: Json; tax_regime?: string | null; trade_name?: string | null; type: string }
        Update: { certificate_expiry?: string | null; city?: string | null; city_ibge?: string | null; cnpj?: string | null; created_at?: string; creci?: string | null; id?: string; invoice_config?: Json; logo_color?: string | null; main_cnae?: string | null; municipal_registration?: string | null; name?: string; state?: string | null; state_registration?: string | null; tax_config?: Json; tax_regime?: string | null; trade_name?: string | null; type?: string }
        Relationships: []
      }
      company_members: {
        Row: { company_id: string; created_at: string; role: string; user_id: string }
        Insert: { company_id: string; created_at?: string; role?: string; user_id: string }
        Update: { company_id?: string; created_at?: string; role?: string; user_id?: string }
        Relationships: []
      }
      cost_centers: {
        Row: { company_id: string; created_at: string; description: string | null; id: string; name: string }
        Insert: { company_id: string; created_at?: string; description?: string | null; id?: string; name: string }
        Update: { company_id?: string; created_at?: string; description?: string | null; id?: string; name?: string }
        Relationships: []
      }
      developments: {
        Row: { address: string | null; broker_split_percentage: number | null; commission_percentage: number | null; company_id: string; created_at: string; developer: string | null; id: string; is_active: boolean; name: string; notes: string | null; type: string | null }
        Insert: { address?: string | null; broker_split_percentage?: number | null; commission_percentage?: number | null; company_id: string; created_at?: string; developer?: string | null; id?: string; is_active?: boolean; name: string; notes?: string | null; type?: string | null }
        Update: { address?: string | null; broker_split_percentage?: number | null; commission_percentage?: number | null; company_id?: string; created_at?: string; developer?: string | null; id?: string; is_active?: boolean; name?: string; notes?: string | null; type?: string | null }
        Relationships: []
      }
      employees: {
        Row: { company_id: string; created_at: string; document: string | null; email: string | null; employment_type: string | null; full_name: string; id: string; phone: string | null; role_title: string | null; salary: number | null; status: string; user_id: string | null }
        Insert: { company_id: string; created_at?: string; document?: string | null; email?: string | null; employment_type?: string | null; full_name: string; id?: string; phone?: string | null; role_title?: string | null; salary?: number | null; status?: string; user_id?: string | null }
        Update: { company_id?: string; created_at?: string; document?: string | null; email?: string | null; employment_type?: string | null; full_name?: string; id?: string; phone?: string | null; role_title?: string | null; salary?: number | null; status?: string; user_id?: string | null }
        Relationships: []
      }
      payables: {
        Row: { account: string | null; amount: number; category_id: string | null; company_id: string; competence_date: string | null; cost_center_id: string | null; created_at: string; description: string; due_date: string; employee_id: string | null; id: string; installment_number: number | null; notes: string | null; paid_at: string | null; parent_payable_id: string | null; payment_method: string | null; proof_url: string | null; recurrence: string; recurrence_day: number | null; status: string; supplier_id: string | null; total_installments: number | null }
        Insert: { account?: string | null; amount: number; category_id?: string | null; company_id: string; competence_date?: string | null; cost_center_id?: string | null; created_at?: string; description: string; due_date: string; employee_id?: string | null; id?: string; installment_number?: number | null; notes?: string | null; paid_at?: string | null; parent_payable_id?: string | null; payment_method?: string | null; proof_url?: string | null; recurrence?: string; recurrence_day?: number | null; status?: string; supplier_id?: string | null; total_installments?: number | null }
        Update: { account?: string | null; amount?: number; category_id?: string | null; company_id?: string; competence_date?: string | null; cost_center_id?: string | null; created_at?: string; description?: string; due_date?: string; employee_id?: string | null; id?: string; installment_number?: number | null; notes?: string | null; paid_at?: string | null; parent_payable_id?: string | null; payment_method?: string | null; proof_url?: string | null; recurrence?: string; recurrence_day?: number | null; status?: string; supplier_id?: string | null; total_installments?: number | null }
        Relationships: []
      }
      receivables: {
        Row: { account: string | null; amount: number; category_id: string | null; client_document: string | null; client_name: string | null; commission_installment_id: string | null; company_id: string; competence_date: string | null; cost_center_id: string | null; created_at: string; description: string; due_date: string; id: string; invoice_rule: string; notes: string | null; proof_url: string | null; received_at: string | null; recurrence: string; sale_id: string | null; status: string }
        Insert: { account?: string | null; amount: number; category_id?: string | null; client_document?: string | null; client_name?: string | null; commission_installment_id?: string | null; company_id: string; competence_date?: string | null; cost_center_id?: string | null; created_at?: string; description: string; due_date: string; id?: string; invoice_rule?: string; notes?: string | null; proof_url?: string | null; received_at?: string | null; recurrence?: string; sale_id?: string | null; status?: string }
        Update: { account?: string | null; amount?: number; category_id?: string | null; client_document?: string | null; client_name?: string | null; commission_installment_id?: string | null; company_id?: string; competence_date?: string | null; cost_center_id?: string | null; created_at?: string; description?: string; due_date?: string; id?: string; invoice_rule?: string; notes?: string | null; proof_url?: string | null; received_at?: string | null; recurrence?: string; sale_id?: string | null; status?: string }
        Relationships: []
      }
      sales: {
        Row: { broker_id: string | null; buyer_contact: string | null; buyer_document: string | null; buyer_name: string | null; company_id: string; created_at: string; development_id: string | null; id: string; notes: string | null; payment_method: string | null; sale_date: string | null; sale_value: number; status: string; unit: string | null }
        Insert: { broker_id?: string | null; buyer_contact?: string | null; buyer_document?: string | null; buyer_name?: string | null; company_id: string; created_at?: string; development_id?: string | null; id?: string; notes?: string | null; payment_method?: string | null; sale_date?: string | null; sale_value?: number; status?: string; unit?: string | null }
        Update: { broker_id?: string | null; buyer_contact?: string | null; buyer_document?: string | null; buyer_name?: string | null; company_id?: string; created_at?: string; development_id?: string | null; id?: string; notes?: string | null; payment_method?: string | null; sale_date?: string | null; sale_value?: number; status?: string; unit?: string | null }
        Relationships: []
      }
      suppliers: {
        Row: { company_id: string; created_at: string; document: string | null; email: string | null; id: string; is_active: boolean; legal_name: string; notes: string | null; phone: string | null; trade_name: string | null }
        Insert: { company_id: string; created_at?: string; document?: string | null; email?: string | null; id?: string; is_active?: boolean; legal_name: string; notes?: string | null; phone?: string | null; trade_name?: string | null }
        Update: { company_id?: string; created_at?: string; document?: string | null; email?: string | null; id?: string; is_active?: boolean; legal_name?: string; notes?: string | null; phone?: string | null; trade_name?: string | null }
        Relationships: []
      }
      transactions: {
        Row: { account: string | null; amount: number; category_id: string | null; company_id: string; cost_center_id: string | null; created_at: string; date: string; description: string | null; id: string; payable_id: string | null; receivable_id: string | null; type: string }
        Insert: { account?: string | null; amount: number; category_id?: string | null; company_id: string; cost_center_id?: string | null; created_at?: string; date: string; description?: string | null; id?: string; payable_id?: string | null; receivable_id?: string | null; type: string }
        Update: { account?: string | null; amount?: number; category_id?: string | null; company_id?: string; cost_center_id?: string | null; created_at?: string; date?: string; description?: string | null; id?: string; payable_id?: string | null; receivable_id?: string | null; type?: string }
        Relationships: []
      }
      user_profiles: {
        Row: { avatar_url: string | null; created_at: string; email: string | null; full_name: string | null; id: string; phone: string | null }
        Insert: { avatar_url?: string | null; created_at?: string; email?: string | null; full_name?: string | null; id: string; phone?: string | null }
        Update: { avatar_url?: string | null; created_at?: string; email?: string | null; full_name?: string | null; id?: string; phone?: string | null }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
