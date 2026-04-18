import * as Phaser from 'phaser'

export class ProjectsScene extends Phaser.Scene {
  constructor() {
    super('ProjectsScene')
  }

  preload() {
    this.load.image('projects-bg', '/game/projects.jpg')
  }

  create() {
    const { width, height } = this.scale
    const bg = this.add.image(width / 2, height / 2, 'projects-bg')
    bg.setDisplaySize(width, height)

    // Botão Voltar (Placeholder)
    const backBtn = this.add.text(100, 100, '← Voltar', {
      fontSize: '32px',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 10, y: 5 }
    }).setInteractive({ cursor: 'pointer' })

    backBtn.on('pointerdown', () => this.scene.start('GuildScene'))
  }
}
