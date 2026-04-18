import * as Phaser from 'phaser'
import { useGameStore } from '~/stores/game'

/**
 * GuildScene - Cena principal da Guilda (Construção Diegética)
 * Refatorada para alinhamento geométrico e perspectiva baseada na Shell.
 */
export class GuildScene extends Phaser.Scene {
  private gameStore = useGameStore()

  constructor() {
    super('GuildScene')
  }

  preload() {
    this.load.image('guild-shell', '/game/guild_shell.png')
    this.load.image('barrels', '/game/barrels_transparent.png')
    this.load.image('rug', '/game/rug_transparent.png')
    this.load.image('banner', '/game/banner_transparent.png')
    this.load.image('counter', '/game/counter.png')
    this.load.image('work-table', '/game/work_table.png')
    
    const graphics = this.make.graphics({ x: 0, y: 0, add: false })
    graphics.fillStyle(0xffffff, 0.5)
    graphics.fillCircle(2, 2, 2)
    graphics.generateTexture('dust-particle', 4, 4)
  }

  create() {
    const { width, height } = this.scale
    
    // --- ÂNCORAS GEOMÉTRICAS (Análise Visual Refinada) ---
    // Âncora C (Ponto de Fuga): Base do arco central onde as tábuas do chão convergem
    const vanishingPoint = { x: width / 2, y: height * 0.44 }
    
    // --- 1. AMBIENTE BASE ---
    this.add.image(width / 2, height / 2, 'guild-shell').setDepth(0).setDisplaySize(width, height)
    this.cameras.main.postFX.addVignette(0.5, 0.5, 0.85, 0.35)

    // --- 2. ILUMINAÇÃO (TOCHAS) ---
    const torchLeft = this.add.circle(width * 0.25, height * 0.35, 10, 0xffaa00, 0).setDepth(3)
    const torchRight = this.add.circle(width * 0.75, height * 0.35, 10, 0xffaa00, 0).setDepth(3)
    const glowL = torchLeft.postFX ? torchLeft.postFX.addGlow(0xffaa00, 4, 0, false, 0.1, 24) : null
    const glowR = torchRight.postFX ? torchRight.postFX.addGlow(0xffaa00, 4, 0, false, 0.1, 24) : null
    
    // --- 3. PROPS DE PAREDE ---
    const bannerLeft = this.add.image(width * 0.25, height * 0.35, 'banner').setDepth(2).setScale(0.8)
    const bannerRight = this.add.image(width * 0.75, height * 0.35, 'banner').setDepth(2).setScale(0.8)

    // --- 4. CHÃO E PERSPECTIVA (Âncora A e C) ---
    // Tapete posicionado 'atrás' (Depth menor) e seguindo o ângulo das tábuas do chão.
    const rug = this.add.image(width / 2, height * 0.82, 'rug')
      .setDepth(1) // Depth menor que os móveis (Âncora A e B)
      .setScale(2.4, 0.8) // Proporção ajustada para perspectiva
      .setAlpha(0.9)
      .setTint(0x886655)

    // --- 5. OCLUSÃO E MÓVEIS (Âncora A e B) ---
    // Âncora A (Balcão): Começa na viga lateral e termina no corredor central.
    const counter = this.add.image(width * 0.30, height * 0.78, 'counter')
      .setDepth(10) 
      .setScale(0.82)
    
    // Âncora B (Mesa): Altura relativa à base do chão (0.78h)
    const workTable = this.add.image(width * 0.70, height * 0.78, 'work-table')
      .setDepth(10)
      .setScale(0.82)

    // Barris: Encostados nas vigas estruturais laterais (não flutuando)
    const barrelLeft = this.add.image(width * 0.05, height * 0.90, 'barrels')
      .setDepth(15) // Na frente de tudo
      .setScale(1.0)
    
    const barrelRight = this.add.image(width * 0.95, height * 0.90, 'barrels')
      .setDepth(15) 
      .setScale(0.8)
      .setFlipX(true)

    // --- 6. HOTSPOTS ---
    this.createHotspot(width * 0.25, height * 0.35, 120, 200, 'Quadro de Missões', () => this.gameStore.openPanel('tasks'))
    this.createHotspot(width * 0.32, height * 0.76, 300, 180, 'Agenda da Guilda', () => this.gameStore.openPanel('calendar'))
    this.createHotspot(width * 0.68, height * 0.76, 300, 180, 'Mesa de Projetos', () => this.gameStore.openPanel('projects'))

    // --- 7. ANIMAÇÕES E LOOP ---
    this.time.addEvent({
      delay: 150,
      callback: () => {
        const intensity = Phaser.Math.FloatBetween(2, 6)
        const tint = Phaser.Math.Between(0xaa8866, 0xffddaa)
        if (glowL) glowL.outerStrength = intensity
        if (glowR) glowR.outerStrength = intensity
        bannerLeft.setTint(tint)
        bannerRight.setTint(tint)
        const ambientTint = Phaser.Math.Between(0x997755, 0xbb9977)
        counter.setTint(ambientTint)
        workTable.setTint(ambientTint)
        barrelLeft.setTint(ambientTint)
        barrelRight.setTint(ambientTint)
      },
      loop: true
    })

    this.tweens.add({
      targets: [bannerLeft, bannerRight],
      angle: { from: -1.5, to: 1.5 },
      duration: 4000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })

    this.add.particles(0, 0, 'dust-particle', {
      x: { min: 0, max: width },
      y: { min: 0, max: height },
      lifespan: 10000,
      speed: { min: 5, max: 20 },
      scale: { start: 0.5, end: 1 },
      alpha: { start: 0, end: 0.2, yoyo: true },
      quantity: 1,
      frequency: 200,
      blendMode: 'ADD'
    }).setDepth(10)

    console.log('GuildScene: Refatoração Geométrica e Atmosférica concluída.')
  }

  private createHotspot(x: number, y: number, w: number, h: number, name: string, callback: () => void) {
    const zone = this.add.zone(x, y, w, h).setInteractive({ cursor: 'pointer' })
    zone.on('pointerover', () => this.gameStore.setHovered(name))
    zone.on('pointerout', () => this.gameStore.setHovered(null))
    zone.on('pointerdown', callback)
    return zone
  }
}
