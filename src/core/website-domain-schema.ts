import { z } from 'zod';

/** No public suffix lookup; validates DNS label syntax only. */
export const websiteDomainSchema = z.string().trim().toLowerCase().min(4).max(253).refine(value => {
  const labels = value.split('.');
  return labels.length >= 2 && labels.every(label =>
    label.length >= 1 && label.length <= 63 &&
    /^[a-z0-9-]+$/.test(label) && !label.startsWith('-') && !label.endsWith('-')
  ) && /^[a-z]{2,63}$/.test(labels[labels.length - 1]);
}, 'Invalid website domain');
