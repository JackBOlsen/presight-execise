/**
 * Nationality decoration.
 *
 * Presentation only, so it lives on the client rather than in the API contract:
 * adding a flag does not change what a user *is*. An unmapped nationality
 * simply renders without a flag, so the seed vocabulary and this map can drift
 * without breaking anything — the failure mode is a missing emoji, not a
 * missing person.
 */
const FLAGS: Readonly<Record<string, string>> = {
  American: '🇺🇸',
  Argentine: '🇦🇷',
  Australian: '🇦🇺',
  Austrian: '🇦🇹',
  Belgian: '🇧🇪',
  Brazilian: '🇧🇷',
  British: '🇬🇧',
  Bulgarian: '🇧🇬',
  Canadian: '🇨🇦',
  Chinese: '🇨🇳',
  Croatian: '🇭🇷',
  Czech: '🇨🇿',
  Danish: '🇩🇰',
  Dutch: '🇳🇱',
  Egyptian: '🇪🇬',
  Estonian: '🇪🇪',
  Filipino: '🇵🇭',
  Finnish: '🇫🇮',
  French: '🇫🇷',
  German: '🇩🇪',
  Greek: '🇬🇷',
  Hungarian: '🇭🇺',
  Icelandic: '🇮🇸',
  Indian: '🇮🇳',
  Indonesian: '🇮🇩',
  Irish: '🇮🇪',
  Italian: '🇮🇹',
  Japanese: '🇯🇵',
  Kenyan: '🇰🇪',
  Korean: '🇰🇷',
  Latvian: '🇱🇻',
  Lithuanian: '🇱🇹',
  Mexican: '🇲🇽',
  Moroccan: '🇲🇦',
  Nigerian: '🇳🇬',
  Norwegian: '🇳🇴',
  Polish: '🇵🇱',
  Portuguese: '🇵🇹',
  Romanian: '🇷🇴',
  Serbian: '🇷🇸',
  Slovak: '🇸🇰',
  'South African': '🇿🇦',
  Spanish: '🇪🇸',
  Swedish: '🇸🇪',
  Swiss: '🇨🇭',
  Turkish: '🇹🇷',
  Ukrainian: '🇺🇦',
  Vietnamese: '🇻🇳',
};

export function flagFor(nationality: string): string | undefined {
  return FLAGS[nationality];
}
