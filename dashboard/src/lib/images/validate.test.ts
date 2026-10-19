import { describe, expect, it } from 'vitest';
import { DOWNSCALE_EDGE, planDownscale } from './downscale';
import { checkPicture, pictureType, registrationName, typeList } from './validate';

const limits = { maxBytes: 20 * 1024 * 1024, maxPerMessage: 3, contentTypes: ['image/jpeg', 'image/png', 'image/webp'] };
const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('checkPicture', () => {
  it('accepts a picture within the limits', () => {
    expect(checkPicture(file('a.jpg', 'image/jpeg'), limits, 0)).toBeNull();
    expect(checkPicture(file('a.webp', 'image/webp', limits.maxBytes), limits, 2)).toBeNull();
  });

  it('refuses a fourth picture, with the count from the config', () => {
    expect(checkPicture(file('a.jpg', 'image/jpeg'), limits, 3)).toBe('You can attach up to 3 pictures to a message.');
    expect(checkPicture(file('a.jpg', 'image/jpeg'), { ...limits, maxPerMessage: 1 }, 1)).toBe('You can attach up to 1 picture to a message.');
  });

  it('names the accepted types from the config, not from a fixed list', () => {
    expect(checkPicture(file('a.gif', 'image/gif'), limits, 0)).toBe('Use a JPEG, PNG or WebP picture.');
    expect(checkPicture(file('a.heic', 'image/heic'), limits, 0)).toBe('Use a JPEG, PNG or WebP picture.');
    expect(checkPicture(file('a.png', 'image/png'), { ...limits, contentTypes: ['image/jpeg'] }, 0)).toBe('Use a JPEG picture.');
    expect(typeList(['image/jpeg', 'image/png', 'image/webp'])).toBe('JPEG, PNG or WebP');
  });

  it('uses the size limit from the config', () => {
    expect(checkPicture(file('big.jpg', 'image/jpeg', limits.maxBytes + 1), limits, 0)).toMatch(/over the 20 MB limit/);
    expect(checkPicture(file('mid.jpg', 'image/jpeg', 6 * 1024 * 1024), { ...limits, maxBytes: 5 * 1024 * 1024 }, 0)).toMatch(/over the 5\.0 MB limit/);
    expect(checkPicture(file('empty.jpg', 'image/jpeg', 0), limits, 0)).toBe('empty.jpg is empty.');
  });

  it('reads a missing type from the extension (dragged and pasted files sometimes have none)', () => {
    expect(pictureType(file('shot.PNG', ''))).toBe('image/png');
    expect(checkPicture(file('shot.png', ''), limits, 0)).toBeNull();
    expect(checkPicture(file('shot.bmp', ''), limits, 0)).toBe('Use a JPEG, PNG or WebP picture.');
  });
});

describe('registrationName', () => {
  it('keeps a good name', () => {
    expect(registrationName(file('IMG_0042.jpeg', 'image/jpeg'))).toBe('IMG_0042.jpeg');
    expect(registrationName(file('screen.png', 'image/png'))).toBe('screen.png');
  });

  it('fixes an extension that disagrees with the type, and adds one when missing', () => {
    expect(registrationName(file('photo.png', 'image/jpeg'))).toBe('photo.jpg');
    expect(registrationName(file('image', 'image/png'))).toBe('image.png');
    expect(registrationName(file('', 'image/webp'))).toBe('picture.webp');
  });

  it('drops folders and stays within 260 characters', () => {
    expect(registrationName(file('C:\\Users\\me\\pics\\a.jpg', 'image/jpeg'))).toBe('a.jpg');
    expect(registrationName(file('a/b/c.png', 'image/png'))).toBe('c.png');
    const long = registrationName(file(`${'x'.repeat(400)}.jpg`, 'image/jpeg'));
    expect(long.length).toBeLessThanOrEqual(260);
    expect(long.endsWith('.jpg')).toBe(true);
  });
});

describe('planDownscale (the optional browser-side shrink)', () => {
  const MB = 1024 * 1024;
  it('leaves pictures that are already small enough', () => {
    expect(planDownscale({ width: 1600, height: 1200, type: 'image/jpeg', size: 4 * MB })).toBeNull();
    expect(planDownscale({ width: DOWNSCALE_EDGE, height: 1000, type: 'image/jpeg', size: 9 * MB })).toBeNull();
  });

  it('shrinks a big photo to a 2048 px long edge, keeping its shape and format', () => {
    expect(planDownscale({ width: 4032, height: 3024, type: 'image/jpeg', size: 5 * MB })).toEqual({ type: 'image/jpeg', width: 2048, height: 1536 });
    expect(planDownscale({ width: 3000, height: 6000, type: 'image/webp', size: 3 * MB })).toEqual({ type: 'image/webp', width: 1024, height: 2048 });
  });

  it('does not bother with a large-pixel photo that is already a small file', () => {
    expect(planDownscale({ width: 4000, height: 3000, type: 'image/jpeg', size: 400 * 1024 })).toBeNull();
  });

  it('leaves PNGs (screenshots of text) alone unless the file is huge, and never turns them into JPEGs', () => {
    expect(planDownscale({ width: 3840, height: 2160, type: 'image/png', size: 3 * MB })).toBeNull();
    expect(planDownscale({ width: 5000, height: 4000, type: 'image/png', size: 15 * MB })).toEqual({ type: 'image/png', width: 2048, height: 1638 });
  });

  it('ignores formats the API does not take', () => {
    expect(planDownscale({ width: 5000, height: 4000, type: 'image/heic', size: 15 * MB })).toBeNull();
  });
});
