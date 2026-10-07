class FlowerLogo {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.size = options.size || 32;
    this.duration = options.duration || 1600;
    this.hoverPause = options.hoverPause || false;
    this.currentIndex = 0;
    
    this.flowers = this.generateFlowers();
    this.init();
  }

  generateFlowers() {
    const svgs = [];
    const cx = 50, cy = 50;
    
    const ring = (count, path, fill, scale = 1, rotOffset = 0) => {
      let g = `<g fill="${fill}" transform="translate(${cx}, ${cy}) scale(${scale})">`;
      for(let i=0; i<count; i++) {
        const angle = (360 / count) * i + rotOffset;
        g += `<path d="${path}" transform="rotate(${angle})" />`;
      }
      g += `</g>`;
      return g;
    };

    // 1. Lavender pinwheel
    const p1 = "M0,0 C15,-20 20,-10 5,-40 C-10,-10 -5,-20 0,0";
    svgs.push(`
      ${ring(6, p1, '#B9A3D6')}
      ${ring(6, p1, '#8A72BC', 0.85, 30)}
      <circle cx="50" cy="50" r="9" fill="#6F58A8" />
    `);

    // 2. Crimson star
    const p2 = "M0,0 Q12,-20 0,-45 Q-12,-20 0,0";
    const star = "M50,38 L53,46 L61,46 L55,51 L57,59 L50,55 L43,59 L45,51 L39,46 L47,46 Z";
    svgs.push(`
      ${ring(5, p2, '#D81B4A')}
      <path d="${star}" fill="#F5C518" />
    `);

    // 3. Teal layered spiky
    const p3 = "M0,0 C10,-15 5,-35 0,-45 C-5,-35 -10,-15 0,0";
    svgs.push(`
      ${ring(8, p3, '#8FD1B8', 1, 22.5)}
      ${ring(8, p3, '#3FA89B', 0.85, 0)}
      <circle cx="50" cy="50" r="7" fill="#2E7D7A" />
    `);

    // 4. Hot pink pentagon blob
    const p4 = "M0,0 C25,-15 25,-45 0,-45 C-25,-45 -25,-15 0,0";
    const stamen = "M0,-8 L0,-16";
    svgs.push(`
      ${ring(5, p4, '#E8326F')}
      <circle cx="50" cy="50" r="12" fill="#A0154F" />
      <g stroke="#E8326F" stroke-width="2" stroke-linecap="round" transform="translate(50,50)">
        ${[0,1,2,3,4,5,6,7].map(i => `<path d="${stamen}" transform="rotate(${i*45})" />`).join('')}
      </g>
    `);

    // 5. Magenta clover
    const p5 = "M0,0 C20,-10 20,-40 0,-40 C-20,-40 -20,-10 0,0";
    svgs.push(`
      ${ring(5, p5, '#D63EA0')}
      ${ring(5, p5, '#A02C8A', 0.35, 36)}
    `);

    // 6. Orange flower
    const p6 = "M0,0 C15,-10 15,-40 0,-40 C-15,-40 -15,-10 0,0";
    svgs.push(`
      ${ring(8, p6, '#F26A21')}
      ${ring(8, p6, '#E0471C', 0.7, 22.5)}
      <circle cx="50" cy="50" r="9" fill="#C9461F" />
    `);

    // 7. Pale daisy
    const p7 = "M0,0 C8,-15 8,-45 0,-45 C-8,-45 -8,-15 0,0";
    svgs.push(`
      ${ring(10, p7, '#D5E3E8')}
      <circle cx="50" cy="50" r="11" fill="#5FA8A0" />
    `);

    // 8. Plum star-burst
    const p8 = "M0,0 C5,-15 3,-45 0,-45 C-3,-45 -5,-15 0,0";
    svgs.push(`
      ${ring(10, p8, '#8E3A7C')}
      <circle cx="50" cy="50" r="9" fill="#6E2A66" />
    `);

    // 9. Lilac soft flower
    const p9 = "M0,0 C25,-5 30,-35 0,-40 C-30,-35 -25,-5 0,0";
    svgs.push(`
      ${ring(5, p9, '#BFA3D0')}
      <circle cx="50" cy="50" r="14" fill="#8E74B8" />
      <circle cx="50" cy="50" r="8" fill="#6F58A8" />
    `);

    // 10. Crimson pom-pom
    const p10 = "M0,0 Q6,-25 0,-45 Q-6,-25 0,0";
    svgs.push(`
      ${ring(14, p10, '#D0183F')}
      ${ring(14, p10, '#D0183F', 0.8, 12.85)}
      <circle cx="50" cy="50" r="10" fill="#A3123A" />
    `);

    // 11. Golden flower
    const p11 = "M0,0 C20,-10 20,-45 0,-45 C-20,-45 -20,-10 0,0";
    svgs.push(`
      ${ring(6, p11, '#F7B500')}
      <circle cx="50" cy="50" r="12" fill="#D81B4A" />
    `);

    // 12. Green-teal star
    const p12 = "M0,0 C12,-15 5,-40 0,-45 C-5,-40 -12,-15 0,0";
    svgs.push(`
      ${ring(6, p12, '#5BB3A0')}
      <circle cx="50" cy="50" r="12" fill="#2F8077" />
      <path d="M50,38 L50,62 M38,50 L62,50" stroke="#5BB3A0" stroke-width="2.5" />
    `);

    // 13. Blue four-petal
    const p13 = "M0,0 C15,-5 25,-25 15,-40 C5,-35 -5,-35 -15,-40 C-25,-25 -15,-5 0,0";
    svgs.push(`
      ${ring(4, p13, '#1EA7D6')}
      <path d="M50,38 L50,62 M38,50 L62,50" stroke="#7CC4E8" stroke-width="5" stroke-linecap="round" />
    `);

    // 14. Yellow star-flower
    const p14 = "M0,0 Q10,-20 0,-45 Q-10,-20 0,0";
    svgs.push(`
      ${ring(8, p14, '#FBBF1C')}
      <path d="M50,40 L53,50 L60,50 L50,53 L50,60 L47,50 L40,50 L50,47 Z" fill="#F59E0B" />
    `);

    // 15. Blue scalloped
    const p15 = "M0,0 C15,-10 20,-30 0,-40 C-20,-30 -15,-10 0,0";
    const p15_high = "M0,-25 C5,-28 0,-35 0,-35 C0,-35 -5,-28 0,-25";
    svgs.push(`
      ${ring(8, p15, '#4B8DB5')}
      ${ring(8, p15, '#3A7CA5', 0.75, 22.5)}
      ${ring(8, p15_high, '#7FB8D9')}
      <circle cx="50" cy="50" r="9" fill="#3A7CA5" />
    `);

    // 16. Chrysanthemum
    const p16 = "M0,0 Q5,-20 0,-45 Q-5,-20 0,0";
    svgs.push(`
      ${ring(16, p16, '#FBC02D')}
      ${ring(16, p16, '#F7931E', 0.8, 11.25)}
      <circle cx="50" cy="50" r="11" fill="#F7931E" />
    `);

    return svgs.map(inner => `<svg viewBox="0 0 100 100" width="100%" height="100%" style="display:block; overflow:visible;">${inner}</svg>`);
  }

  init() {
    this.container.style.setProperty('--size', `${this.size}px`);
    this.container.style.setProperty('--duration', `${this.duration}ms`);
    this.container.classList.add('flower-logo-container');
    this.container.setAttribute('aria-label', 'NegoSim');
    
    this.spinEl = document.createElement('div');
    this.spinEl.className = 'flower-logo-spin';
    
    this.pulseEl = document.createElement('div');
    this.pulseEl.className = 'flower-logo-pulse';
    
    if (this.hoverPause) {
      this.spinEl.classList.add('hover-pause');
      this.pulseEl.classList.add('hover-pause');
    }
    
    this.spinEl.appendChild(this.pulseEl);
    this.container.appendChild(this.spinEl);
    
    this.nMarkEl = document.createElement('div');
    this.nMarkEl.className = 'flower-logo-n-mark';
    this.nMarkEl.innerHTML = `<svg viewBox="0 0 32 32" width="100%" height="100%" style="display:block;">
      <rect width="32" height="32" rx="8" fill="var(--color-primary)" />
      <text x="16" y="21" font-size="16" font-weight="800" fill="#fff" text-anchor="middle" font-family="inherit">N</text>
    </svg>`;
    this.container.appendChild(this.nMarkEl);
    
    this.renderCurrent();

    this.handleIteration = () => {
      this.currentIndex = (this.currentIndex + 1) % this.flowers.length;
      this.renderCurrent();
    };

    // Swap shapes perfectly at the cycle boundary
    this.pulseEl.addEventListener('animationiteration', this.handleIteration);
  }

  renderCurrent() {
    this.pulseEl.innerHTML = this.flowers[this.currentIndex];
  }

  destroy() {
    if (this.pulseEl) {
      this.pulseEl.removeEventListener('animationiteration', this.handleIteration);
    }
    this.container.innerHTML = '';
  }
}

window.FlowerLogo = FlowerLogo;
