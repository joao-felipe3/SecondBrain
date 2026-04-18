import * as Phaser from 'phaser'

export class TasksScene extends Phaser.Scene {
  constructor() {
    super('TasksScene')
  }

  preload() {
    this.load.image('tasks-bg', '/game/tasks.jpg')
  }

  create() {
    const { width, height } = this.scale
    const bg = this.add.image(width / 2, height / 2, 'tasks-bg')
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
