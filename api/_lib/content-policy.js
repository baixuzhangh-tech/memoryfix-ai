const acceptedValues = new Set(['1', 'true', 'yes', 'on', 'accepted'])

const prohibitedPatterns = [
  {
    category: 'adult or explicit sexual content',
    pattern:
      /\b(nsfw|porn|porno|pornographic|nude|nudity|naked|erotic|sexual|sex act|explicit|fetish|onlyfans)\b/i,
  },
  {
    category: 'sexualized minors or child exploitation',
    pattern:
      /\b(child porn|csam|minor nude|underage sexual|sexualized child|sexualized minor)\b/i,
  },
  {
    category: 'deepfake, face-swap, or identity manipulation',
    pattern:
      /\b(deepfake|face\s*swap|faceswap|swap\s+face|replace\s+face|put\s+.*\s+face|celebrity\s+face|impersonat|make\s+.*\s+look\s+like\s+someone\s+else)\b/i,
  },
  {
    category: 'non-consensual intimate imagery',
    pattern:
      /\b(revenge porn|non[-\s]?consensual intimate|leaked nude|undress|remove clothes|make nude)\b/i,
  },
  {
    category: 'hateful, abusive, or violent content',
    pattern:
      /\b(nazi|kkk|terrorist propaganda|graphic gore|beheading|torture|kill them|hate symbol)\b/i,
  },
  {
    category: 'fraud or official document alteration',
    pattern:
      /\b(fake passport|fake id|driver.?s license|bank statement|credit card|counterfeit|forge|forgery)\b/i,
  },
]

export function hasAcceptedContentPolicy(fields = {}) {
  const value =
    fields.contentPolicyAccepted ||
    fields.policyAccepted ||
    fields.acceptableUseAccepted ||
    ''

  return acceptedValues.has(String(value).trim().toLowerCase())
}

export function validateContentPolicyAcceptance(fields = {}) {
  if (hasAcceptedContentPolicy(fields)) {
    return ''
  }

  return 'Please confirm that you own or have permission to submit this photo and that it follows our Acceptable Use Policy.'
}

export function validateHumanRestoreSubmissionText({
  fileName = '',
  notes = '',
} = {}) {
  const text = `${fileName}\n${notes}`.trim()

  if (!text) {
    return ''
  }

  const match = prohibitedPatterns.find(item => item.pattern.test(text))

  if (!match) {
    return ''
  }

  return `We cannot accept requests involving ${match.category}. Please submit only lawful old-photo restoration requests that follow our Acceptable Use Policy.`
}
