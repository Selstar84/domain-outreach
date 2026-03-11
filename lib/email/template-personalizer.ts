export interface PersonalizationContext {
  prospect_domain: string
  company_name?: string | null
  contact_name?: string | null
  my_domain: string
  asking_price?: number | null
}

/**
 * Replaces template variables with actual prospect/campaign data.
 * Supported variables: {prospect_domain}, {company_name}, {contact_name}, {my_domain}, {asking_price}
 */
export function personalizeTemplate(template: string, ctx: PersonalizationContext): string {
  return template
    .replace(/\{prospect_domain\}/gi, ctx.prospect_domain)
    .replace(/\{company_name\}/gi, ctx.company_name ?? ctx.prospect_domain)
    .replace(/\{contact_name\}/gi, ctx.contact_name ?? '')
    .replace(/\{my_domain\}/gi, ctx.my_domain)
    .replace(/\{asking_price\}/gi, ctx.asking_price ? `$${ctx.asking_price.toLocaleString()}` : '')
}
