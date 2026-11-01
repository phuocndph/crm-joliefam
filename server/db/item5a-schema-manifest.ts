// PostgreSQL 16 catalog oracle captured from the exact six raw Item5A files
// in an owned, dependency-only fixture. Owner identity is deliberately
// normalized to `owner_is_current_user`; no fixture role name is frozen.
export const item5aSchemaManifest = {
  postgresqlMajor: 16,
  rawSourceChain: [
    ["070_local_product_supply_classifications.sql", "91b9023f1805879f1b15cd2a5dcb4a0acb8742ac2f5fcb42fec2fd6651bea76a"],
    ["071_local_product_technical_profiles.sql", "2d0a3fc202d67c5cb8dbd8bcc2a655ab7fa94543958760df8ae2b5c2b8338dff"],
    ["072_local_product_labor_mappings.sql", "abc9666f4f83886ac86d530ed3ce949bd5302f60444f502cf6177af3dcb4c12d"],
    ["073_local_labor_code_requirements.sql", "094ac235a9e1ccbda1ae5d510dea21aeddec97b97c993f632b7737b4f1b4cefb"],
    ["074_local_product_rate_action_receipts.sql", "6ef726866300c4ea13007b7fb643aaa515305a4e9d48501c5749054df094d736"],
    ["077_local_labor_requirement_seed_quarantine.sql", "a500cba48d564881da6c63f3ade868551ad8ac8024ad9f12943b8fa5ae493a25"],
  ],
  projection: {
    relations: ["relkind", "relpersistence", "relrowsecurity", "relforcerowsecurity", "owner_is_current_user", "relation_acl"],
    columns: ["default_expression", "column_acl"],
    functions: ["provolatile", "prosecdef", "proleakproof", "owner_is_current_user", "proconfig", "function_acl", "prosrc"],
    triggers: ["all_noninternal_on_target_relations", "exact_071_source_trigger", "tgenabled", "definition"],
    policies: ["all_policies_on_target_relations"],
  },
  schemaSha256: "ec76865561ac1a307f8adc4026201b0515081d940d3f85f67bda1f9e07168b2e",
} as const;
