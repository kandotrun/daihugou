import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('mobile responsive layout CSS', () => {
	it('reserves iOS safe-area padding and keeps the shell edge-to-edge without horizontal overflow', () => {
		expect(css).toContain('env(safe-area-inset-left)');
		expect(css).toContain('overflow-x: hidden');
		expect(css).toMatch(/\.shell[\s\S]*max-width:\s*1240px/);
	});

	it('uses compact card sizing and touch-friendly horizontal hand scrolling on phones', () => {
		expect(css).toMatch(
			/@media \(max-width: 560px\)[\s\S]*\.card[\s\S]*width:\s*clamp\(54px, 17vw, 64px\)/,
		);
		expect(css).toMatch(/\.hand[\s\S]*scroll-snap-type:\s*x proximity/);
		expect(css).toMatch(/button\.card[\s\S]*scroll-snap-align:\s*start/);
	});

	it('keeps action controls reachable on mobile while preserving full-width tap targets', () => {
		expect(css).toMatch(/@media \(max-width: 560px\)[\s\S]*\.controls[\s\S]*position:\s*sticky/);
		expect(css).toMatch(/@media \(max-width: 560px\)[\s\S]*button[\s\S]*min-height:\s*48px/);
	});
});
