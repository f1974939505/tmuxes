import { describe, it, expect } from 'vitest';
import { parseWslList } from '../src/wsl.js';

const BOM = String.fromCharCode(0xfeff);

describe('parseWslList', () => {
  it('parses CRLF list, strips BOM, filters docker system distros', () => {
    const out = `${BOM}Ubuntu\r\nDebian\r\ndocker-desktop\r\ndocker-desktop-data\r\nkali-linux\r\n`;
    expect(parseWslList(out)).toEqual(['Ubuntu', 'Debian', 'kali-linux']);
  });
  it('handles names with version suffixes and blank lines', () => {
    expect(parseWslList('Ubuntu-22.04\n\nUbuntu-24.04\n')).toEqual(['Ubuntu-22.04', 'Ubuntu-24.04']);
  });
  it('returns [] for empty output', () => {
    expect(parseWslList('')).toEqual([]);
    expect(parseWslList(BOM + '\r\n')).toEqual([]);
  });
});
