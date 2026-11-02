
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accounts": {
                  Row: {
                    "card_last4": string | null,"closing_day": number | null,"created_at": string,"credit_limit": number | null,"currency": Database["public"]['Enums']["currency_code"],"id": string,"last4": string | null,"name": string,"notes": string | null,"opening_balance": number | null,"opening_balance_at": string | null,"payment_day": number | null,"sort_order": number,"type": Database["public"]['Enums']["account_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "card_last4"?: string | null,"closing_day"?: number | null,"created_at"?: string,"credit_limit"?: number | null,"currency"?: Database["public"]['Enums']["currency_code"],"id"?: string,"last4"?: string | null,"name": string,"notes"?: string | null,"opening_balance"?: number | null,"opening_balance_at"?: string | null,"payment_day"?: number | null,"sort_order"?: number,"type": Database["public"]['Enums']["account_type"]
                  }
                  Update: {
                    "card_last4"?: string | null,"closing_day"?: number | null,"created_at"?: string,"credit_limit"?: number | null,"currency"?: Database["public"]['Enums']["currency_code"],"id"?: string,"last4"?: string | null,"name"?: string,"notes"?: string | null,"opening_balance"?: number | null,"opening_balance_at"?: string | null,"payment_day"?: number | null,"sort_order"?: number,"type"?: Database["public"]['Enums']["account_type"]
                  }
                  Relationships: [
                    
                  ]
                },"allowed_emails": {
                  Row: {
                    "email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email": string
                  }
                  Update: {
                    "email"?: string
                  }
                  Relationships: [
                    
                  ]
                },"budgets": {
                  Row: {
                    "amount": number,"category_id": string | null,"id": string,"month": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"category_id"?: string | null,"id"?: string,"month": string
                  }
                  Update: {
                    "amount"?: number,"category_id"?: string | null,"id"?: string,"month"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budgets_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "color": string | null,"icon": string | null,"id": string,"kind": Database["public"]['Enums']["category_kind"],"name": string,"parent_id": string | null,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"icon"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["category_kind"],"name": string,"parent_id"?: string | null,"sort_order"?: number
                  }
                  Update: {
                    "color"?: string | null,"icon"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["category_kind"],"name"?: string,"parent_id"?: string | null,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"company_invoices": {
                  Row: {
                    "base": number,"client": string,"date": string,"detraccion": number,"id": string,"igv": number,"invoice_no": string | null,"my_share_pct": number,"received_amount": number | null,"renta_estimada": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base": number,"client": string,"date": string,"detraccion"?: number,"id"?: string,"igv"?: number,"invoice_no"?: string | null,"my_share_pct"?: number,"received_amount"?: number | null,"renta_estimada"?: number
                  }
                  Update: {
                    "base"?: number,"client"?: string,"date"?: string,"detraccion"?: number,"id"?: string,"igv"?: number,"invoice_no"?: string | null,"my_share_pct"?: number,"received_amount"?: number | null,"renta_estimada"?: number
                  }
                  Relationships: [
                    
                  ]
                },"company_withdrawals": {
                  Row: {
                    "amount": number,"date": string,"id": string,"transaction_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"date": string,"id"?: string,"transaction_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"date"?: string,"id"?: string,"transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_withdrawals_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"debt_payments": {
                  Row: {
                    "amount": number,"currency": Database["public"]['Enums']["currency_code"],"debt_id": string,"id": string,"paid_at": string,"transaction_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"currency"?: Database["public"]['Enums']["currency_code"],"debt_id": string,"id"?: string,"paid_at": string,"transaction_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"currency"?: Database["public"]['Enums']["currency_code"],"debt_id"?: string,"id"?: string,"paid_at"?: string,"transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "debt_payments_debt_id_fkey"
      columns: ["debt_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_payments_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"debts": {
                  Row: {
                    "account_id": string | null,"balance": number,"created_at": string,"creditor_person_id": string | null,"currency": Database["public"]['Enums']["currency_code"],"external_op_id": string | null,"id": string,"installment_amount": number | null,"installments_paid": number,"installments_total": number | null,"kind": Database["public"]['Enums']["debt_kind"],"name": string,"next_due_date": string | null,"notes": string | null,"original_amount": number | null,"tcea": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"balance": number,"created_at"?: string,"creditor_person_id"?: string | null,"currency"?: Database["public"]['Enums']["currency_code"],"external_op_id"?: string | null,"id"?: string,"installment_amount"?: number | null,"installments_paid"?: number,"installments_total"?: number | null,"kind": Database["public"]['Enums']["debt_kind"],"name": string,"next_due_date"?: string | null,"notes"?: string | null,"original_amount"?: number | null,"tcea"?: number | null
                  }
                  Update: {
                    "account_id"?: string | null,"balance"?: number,"created_at"?: string,"creditor_person_id"?: string | null,"currency"?: Database["public"]['Enums']["currency_code"],"external_op_id"?: string | null,"id"?: string,"installment_amount"?: number | null,"installments_paid"?: number,"installments_total"?: number | null,"kind"?: Database["public"]['Enums']["debt_kind"],"name"?: string,"next_due_date"?: string | null,"notes"?: string | null,"original_amount"?: number | null,"tcea"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "debts_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debts_creditor_person_id_fkey"
      columns: ["creditor_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"fx_rates": {
                  Row: {
                    "date": string,"source": string,"usd_pen": number
                  }
                  ComputedFields: never
                  Insert: {
                    "date": string,"source"?: string,"usd_pen": number
                  }
                  Update: {
                    "date"?: string,"source"?: string,"usd_pen"?: number
                  }
                  Relationships: [
                    
                  ]
                },"goals": {
                  Row: {
                    "id": string,"name": string,"priority": number,"target_amount": number,"target_date": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"priority"?: number,"target_amount": number,"target_date"?: string | null
                  }
                  Update: {
                    "id"?: string,"name"?: string,"priority"?: number,"target_amount"?: number,"target_date"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"income_events": {
                  Row: {
                    "actual_transaction_id": string | null,"expected_amount": number | null,"expected_date": string,"id": string,"kind": Database["public"]['Enums']["income_event_kind"],"note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_transaction_id"?: string | null,"expected_amount"?: number | null,"expected_date": string,"id"?: string,"kind": Database["public"]['Enums']["income_event_kind"],"note"?: string | null
                  }
                  Update: {
                    "actual_transaction_id"?: string | null,"expected_amount"?: number | null,"expected_date"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["income_event_kind"],"note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "income_events_actual_transaction_id_fkey"
      columns: ["actual_transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"income_profile": {
                  Row: {
                    "afp_commission_type": Database["public"]['Enums']["afp_commission_type"] | null,"afp_fund": number | null,"afp_name": string | null,"bonus_salaries_max": number,"created_at": string,"employer": string,"end_date": string | null,"eps": boolean,"grat_bonus_rate": number,"grat_days_base": number,"id": string,"monthly_gross": number,"pay_schedule": NonNullable<Json>,"profit_sharing_salaries": number,"start_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "afp_commission_type"?: Database["public"]['Enums']["afp_commission_type"] | null,"afp_fund"?: number | null,"afp_name"?: string | null,"bonus_salaries_max"?: number,"created_at"?: string,"employer": string,"end_date"?: string | null,"eps"?: boolean,"grat_bonus_rate": number,"grat_days_base"?: number,"id"?: string,"monthly_gross": number,"pay_schedule"?: NonNullable<Json>,"profit_sharing_salaries"?: number,"start_date": string
                  }
                  Update: {
                    "afp_commission_type"?: Database["public"]['Enums']["afp_commission_type"] | null,"afp_fund"?: number | null,"afp_name"?: string | null,"bonus_salaries_max"?: number,"created_at"?: string,"employer"?: string,"end_date"?: string | null,"eps"?: boolean,"grat_bonus_rate"?: number,"grat_days_base"?: number,"id"?: string,"monthly_gross"?: number,"pay_schedule"?: NonNullable<Json>,"profit_sharing_salaries"?: number,"start_date"?: string
                  }
                  Relationships: [
                    
                  ]
                },"merchant_rules": {
                  Row: {
                    "category_id": string | null,"created_at": string,"id": string,"match_type": Database["public"]['Enums']["rule_match"],"pattern": string,"priority": number,"requires_review": boolean,"tags": (string)[],"tx_type": Database["public"]['Enums']["tx_type"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"id"?: string,"match_type"?: Database["public"]['Enums']["rule_match"],"pattern": string,"priority"?: number,"requires_review"?: boolean,"tags"?: (string)[],"tx_type"?: Database["public"]['Enums']["tx_type"] | null
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"id"?: string,"match_type"?: Database["public"]['Enums']["rule_match"],"pattern"?: string,"priority"?: number,"requires_review"?: boolean,"tags"?: (string)[],"tx_type"?: Database["public"]['Enums']["tx_type"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "merchant_rules_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"people": {
                  Row: {
                    "alias": string | null,"created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alias"?: string | null,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "alias"?: string | null,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"raw_emails": {
                  Row: {
                    "body": string | null,"created_at": string,"error": string | null,"from_address": string | null,"gmail_message_id": string,"id": string,"parse_status": Database["public"]['Enums']["parse_status"],"parser": string | null,"parser_version": string | null,"received_at": string | null,"subject": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"error"?: string | null,"from_address"?: string | null,"gmail_message_id": string,"id"?: string,"parse_status"?: Database["public"]['Enums']["parse_status"],"parser"?: string | null,"parser_version"?: string | null,"received_at"?: string | null,"subject"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"error"?: string | null,"from_address"?: string | null,"gmail_message_id"?: string,"id"?: string,"parse_status"?: Database["public"]['Enums']["parse_status"],"parser"?: string | null,"parser_version"?: string | null,"received_at"?: string | null,"subject"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"shared_expenses": {
                  Row: {
                    "created_at": string,"id": string,"my_share": number,"note": string | null,"total": number,"transaction_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"my_share": number,"note"?: string | null,"total": number,"transaction_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"my_share"?: number,"note"?: string | null,"total"?: number,"transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shared_expenses_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"shared_participants": {
                  Row: {
                    "amount_owed": number,"amount_paid": number,"id": string,"person_id": string,"shared_expense_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_owed": number,"amount_paid"?: number,"id"?: string,"person_id": string,"shared_expense_id": string
                  }
                  Update: {
                    "amount_owed"?: number,"amount_paid"?: number,"id"?: string,"person_id"?: string,"shared_expense_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shared_participants_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shared_participants_shared_expense_id_fkey"
      columns: ["shared_expense_id"]
isOneToOne: false
      referencedRelation: "shared_expenses"
      referencedColumns: ["id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string
                  }
                  Update: {
                    "id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"transactions": {
                  Row: {
                    "account_id": string,"amount": number,"amount_pen": number,"category_id": string | null,"counterpart_account_id": string | null,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"external_op_id": string | null,"fx_rate": number | null,"id": string,"merchant": string | null,"note": string | null,"occurred_at": string,"person_id": string | null,"raw_email_id": string | null,"reversal_of": string | null,"shared_expense_id": string | null,"source": Database["public"]['Enums']["tx_source"],"status": Database["public"]['Enums']["tx_status"],"tags": (string)[],"type": Database["public"]['Enums']["tx_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount": number,"amount_pen": number,"category_id"?: string | null,"counterpart_account_id"?: string | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"external_op_id"?: string | null,"fx_rate"?: number | null,"id"?: string,"merchant"?: string | null,"note"?: string | null,"occurred_at": string,"person_id"?: string | null,"raw_email_id"?: string | null,"reversal_of"?: string | null,"shared_expense_id"?: string | null,"source"?: Database["public"]['Enums']["tx_source"],"status"?: Database["public"]['Enums']["tx_status"],"tags"?: (string)[],"type": Database["public"]['Enums']["tx_type"]
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"amount_pen"?: number,"category_id"?: string | null,"counterpart_account_id"?: string | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"external_op_id"?: string | null,"fx_rate"?: number | null,"id"?: string,"merchant"?: string | null,"note"?: string | null,"occurred_at"?: string,"person_id"?: string | null,"raw_email_id"?: string | null,"reversal_of"?: string | null,"shared_expense_id"?: string | null,"source"?: Database["public"]['Enums']["tx_source"],"status"?: Database["public"]['Enums']["tx_status"],"tags"?: (string)[],"type"?: Database["public"]['Enums']["tx_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_counterpart_account_id_fkey"
      columns: ["counterpart_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_raw_email_id_fkey"
      columns: ["raw_email_id"]
isOneToOne: false
      referencedRelation: "raw_emails"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_reversal_of_fkey"
      columns: ["reversal_of"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_shared_expense_id_fkey"
      columns: ["shared_expense_id"]
isOneToOne: false
      referencedRelation: "shared_expenses"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_allowed_user":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           }
          }
          Enums: {
            "account_type": "corriente"|"ahorros"|"debito"|"credito"|"billetera"|"activo"|"empresa","afp_commission_type": "flujo"|"mixta","category_kind": "gasto"|"ingreso","currency_code": "PEN"|"USD","debt_kind": "tarjeta"|"cuotas"|"personal","income_event_kind": "sueldo"|"gratificacion"|"cts"|"utilidades"|"bono"|"asignacion_vacacional"|"empresa"|"otro","parse_status": "pendiente"|"ok"|"desconocido"|"error"|"ignorado","rule_match": "contiene"|"empieza_con"|"regex","tx_source": "gmail"|"manual"|"recurrente","tx_status": "confirmado"|"por_revisar"|"anulado","tx_type": "gasto"|"ingreso"|"transferencia"|"pago_tarjeta"|"pago_deuda"|"reembolso"|"retiro_efectivo"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_type": ["corriente", "ahorros", "debito", "credito", "billetera", "activo", "empresa"],"afp_commission_type": ["flujo", "mixta"],"category_kind": ["gasto", "ingreso"],"currency_code": ["PEN", "USD"],"debt_kind": ["tarjeta", "cuotas", "personal"],"income_event_kind": ["sueldo", "gratificacion", "cts", "utilidades", "bono", "asignacion_vacacional", "empresa", "otro"],"parse_status": ["pendiente", "ok", "desconocido", "error", "ignorado"],"rule_match": ["contiene", "empieza_con", "regex"],"tx_source": ["gmail", "manual", "recurrente"],"tx_status": ["confirmado", "por_revisar", "anulado"],"tx_type": ["gasto", "ingreso", "transferencia", "pago_tarjeta", "pago_deuda", "reembolso", "retiro_efectivo"]
          }
        }
} as const
