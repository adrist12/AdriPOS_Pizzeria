export function isAccountingAdministrator(
  roleId: string,
  configuredRoleIds: string = import.meta.env.VITE_ACCOUNTING_ADMIN_ROLE_IDS || '0',
): boolean {
  return configuredRoleIds
    .split(',')
    .map((configuredRoleId: string) => configuredRoleId.trim())
    .filter(Boolean)
    .includes(roleId)
}
