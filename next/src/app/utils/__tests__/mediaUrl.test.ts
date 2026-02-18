import { normalizeMediaUrl } from '../mediaUrl';

describe('mediaUrl', () => {
  describe('normalizeMediaUrl', () => {
    it('returns an empty string for non-string values', () => {
      expect(normalizeMediaUrl(undefined)).toBe('');
      expect(normalizeMediaUrl(null)).toBe('');
      expect(normalizeMediaUrl(42 as unknown as string)).toBe('');
    });

    it('returns an empty string for blank input', () => {
      expect(normalizeMediaUrl('')).toBe('');
      expect(normalizeMediaUrl('   ')).toBe('');
    });

    it('returns trimmed relative paths as-is', () => {
      expect(normalizeMediaUrl('  /images/avatar.png?size=sm#v1  ')).toBe('/images/avatar.png?size=sm#v1');
    });

    it('normalizes loopback URLs to path + query + hash', () => {
      expect(normalizeMediaUrl('http://localhost:3000/media/file.png?size=lg#hero')).toBe(
        '/media/file.png?size=lg#hero',
      );
      expect(normalizeMediaUrl('http://127.0.0.1:8080/video.mp4')).toBe('/video.mp4');
    });

    it('keeps valid non-loopback absolute URLs', () => {
      expect(normalizeMediaUrl('https://cdn.example.com/media/image.jpg?x=1')).toBe(
        'https://cdn.example.com/media/image.jpg?x=1',
      );
    });

    it('returns trimmed raw value for invalid URLs', () => {
      expect(normalizeMediaUrl('  not a valid url with spaces  ')).toBe('not a valid url with spaces');
    });
  });
});
