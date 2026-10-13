# Outside the Box

A puzzle game built around the idea of an "Outside-the-Box Thinking Certification" - every level asks you to solve something by breaking the game's own rules or messing with its UI rather than by doing the obvious thing. Built with the Wolfie2D engine, gulp and browserify.

## Running it

```
npm install
npm run build
```

Serve the `dist/` folder however you'd normally serve a static site.

## Structure

- `outside-the-box/` - the actual game source
- `Wolfie2D/` - the engine
- `public/` - static assets served alongside the built game
- `mocks/` - test mocks

Levels live in the game source and each one is designed to make you question the game's UI before you question the puzzle.

## Deploying

Firebase Hosting, configured in `firebase.json`:

```
firebase deploy
```
