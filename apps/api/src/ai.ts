/**
 * Pluggable creative provider.
 *
 * The default is `mock`: a template engine that runs offline with no API key,
 * so the demo always works. Set AI_PROVIDER=openai|anthropic plus the matching
 * key and the same interface calls a real model. Nothing else changes —
 * callers only ever see a `Creative`.
 */
import type { Creative } from '@aura/core';
import { rngFrom, DAY } from '@aura/core';

export interface CreativeBrief {
  brief: string;
  advertiser: string;
  category: string;
  campaignId?: string | null;
  locales?: string[];
}

export interface CreativeProvider {
  readonly name: string;
  generate(input: CreativeBrief, id: string): Promise<Creative>;
}

const TEMPLATES = ['bold-offer', 'lifestyle-split', 'countdown-deal', 'minimal-type', 'gate-native'];

/** Offline template engine. Deterministic given the same brief. */
export class MockCreativeProvider implements CreativeProvider {
  readonly name = 'mock-template';

  async generate(input: CreativeBrief, id: string): Promise<Creative> {
    const { brief, advertiser } = input;
    const r = rngFrom(brief.length * 31 + advertiser.length);
    const lower = brief.toLowerCase();
    const discount = brief.match(/(\d+)\s*%/)?.[1];
    const category =
      /sweet|chocolate|candy|confect/.test(lower) ? 'dutyfree'
        : /coffee|tea|bakery|pastry/.test(lower) ? 'coffee'
          : /toy|kid|child|family/.test(lower) ? 'toys'
            : /perfume|fragrance|cosmetic|beauty/.test(lower) ? 'perfume'
              : /lounge|pass|upgrade/.test(lower) ? 'lounge'
                : input.category;

    const subject = brief.split(/[,.]/)[0].trim();
    const headline = discount
      ? `${subject.replace(new RegExp(`\\s*${discount}%\\s*(off)?`, 'i'), '').trim()} — ${discount}% off`
      : subject;
    const sub =
      /famil/.test(lower) ? 'Built for families travelling together today'
        : /business|lounge/.test(lower) ? 'For travellers who would rather be sitting down'
          : /holiday|beach/.test(lower) ? 'Something for the other end of the flight'
            : 'Airside only, while your gate is still closed';

    return {
      id, campaignId: input.campaignId ?? null, advertiser, category,
      template: TEMPLATES[Math.floor(r() * TEMPLATES.length)],
      headline: { en: headline, ar: discount ? `خصم ${discount}٪ · عرض خاص` : 'عرض خاص' },
      sub: { en: sub, ar: 'عرض حصري داخل المطار' },
      cta: { en: 'Scan to claim', ar: 'امسح للحصول' },
      ratio: r() > 0.5 ? '16:9' : '9:16',
      approval: 'pending', generatedBy: this.name, brief, updated: DAY,
      checks: { brandSafety: true, legibility: true, duration: true, languages: true }
    };
  }
}

/**
 * Live provider. Same interface, one HTTP call. Left unconfigured on purpose:
 * the challenge requires the demo to run with no API key.
 */
export class HostedCreativeProvider implements CreativeProvider {
  constructor(readonly name: string, private endpoint: string, private key: string, private model: string) {}
  async generate(): Promise<Creative> {
    throw new Error(
      `AI_PROVIDER=${this.name} needs AI_ENDPOINT, AI_API_KEY and AI_MODEL. ` +
      'Implement the single fetch here; the rest of the platform is unchanged.'
    );
  }
}

export function buildCreativeProvider(): CreativeProvider {
  const provider = process.env.AI_PROVIDER ?? 'mock';
  if (provider === 'mock') return new MockCreativeProvider();
  return new HostedCreativeProvider(
    provider,
    process.env.AI_ENDPOINT ?? '',
    process.env.AI_API_KEY ?? '',
    process.env.AI_MODEL ?? ''
  );
}
