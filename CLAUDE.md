# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a vanilla JavaScript web game project built with HTML, CSS, and JavaScript. The game features a player-controlled character that must avoid enemies and collect items to increase score.

## Project Structure

```
/
├── index.html          # Main HTML file with game UI structure
├── css/
│   └── styles.css      # All game styling and animations
├── js/
│   └── game.js         # Core game logic and state management
└── assets/             # Directory for images, sounds, or other assets
```

## Architecture

### Game State Management (js/game.js)
- **gameState object**: Central state container holding all game data
  - `isRunning`, `isPaused`: Game status flags
  - `score`, `highScore`: Score tracking (highScore persisted in localStorage)
  - `player`, `enemies`, `collectibles`: Game entity arrays
  - `keys`: Keyboard input tracking object

### Game Loop Pattern
- Uses `requestAnimationFrame()` for smooth 60fps rendering
- Main loop in `gameLoop()` function calls update functions sequentially
- Intervals for spawning enemies (2000ms) and collectibles (3000ms)

### Entity System
- All game objects (player, enemies, collectibles) follow the same structure:
  ```javascript
  {
    element: DOMElement,  // The actual div rendered on screen
    x: number,            // X position
    y: number,            // Y position
    width: number,        // Hitbox width
    height: number        // Hitbox height
  }
  ```

### Collision Detection
- AABB (Axis-Aligned Bounding Box) collision detection in `checkCollision()`
- Called for player vs enemies (game over) and player vs collectibles (score)

### Input Handling
- Supports both arrow keys and WASD for movement
- Spacebar for pause/resume
- Keyboard state tracked in `gameState.keys` object

## Development

### Running the Game
Simply open `index.html` in a web browser. No build process or server required.

For development with live reload, use any local server:
```bash
# Python 3
python -m http.server 8000

# Node.js (with http-server)
npx http-server

# VS Code Live Server extension
# Right-click index.html > "Open with Live Server"
```

### Modifying Game Behavior

**Adjust difficulty**: Edit `config` object in js/game.js:
- `playerSpeed`: Player movement speed (default: 5)
- `enemySpeed`: Enemy chase speed (default: 2)
- `enemySpawnRate`: Milliseconds between enemy spawns (default: 2000)
- `collectibleSpawnRate`: Milliseconds between collectible spawns (default: 3000)

**Change styling**: All visual styles are in css/styles.css
- Color gradients use CSS linear-gradient
- Game objects use absolute positioning within `.game-canvas`
- Responsive breakpoint at 600px for mobile devices

**Add new entity types**: Follow the pattern in `createEnemy()` or `createCollectible()`
1. Create DOM element with appropriate class
2. Position it on canvas
3. Return object with element, x, y, width, height
4. Add to appropriate gameState array
5. Update in game loop

### State Persistence
- High score is saved to `localStorage` with key `'highScore'`
- Cleared only when user clears browser data

## File Relationships

- `index.html` references `css/styles.css` and `js/game.js`
- `game.js` queries DOM elements by ID from `index.html`
- CSS classes in `styles.css` are applied to elements created in `game.js`
- The `assets/` directory is for future expansion (images, audio, etc.)

## Key Functions Reference

| Function | Location | Purpose |
|----------|----------|---------|
| `init()` | js/game.js:40 | Initialize game on page load |
| `startGame()` | js/game.js:180 | Start/restart game, create player, start spawning |
| `gameLoop()` | js/game.js:165 | Main game loop, called every frame |
| `updatePlayer()` | js/game.js:97 | Handle keyboard input and player movement |
| `updateEnemies()` | js/game.js:121 | Move enemies toward player, check collisions |
| `checkCollision()` | js/game.js:155 | AABB collision detection between two objects |
| `gameOver()` | js/game.js:208 | End game, update high score, show game over screen |
