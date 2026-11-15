# Universe rendering

The sky uses the restored silky, flowing light field with its original palette,
reflective ribbons and interactive motion.
Navigation uses translucent periwinkle glass in both themes (62% opacity).
Decorative stars shimmer at fixed positions;
there is no falling-star animation. Floating controls do not blur the animated canvas.

- Knowledge stars and text use up to 3× device resolution within a 14-million-pixel budget.
- Galaxy detail begins at 512 px, then refines to 1024 or 2048 px during idle time.
  Geometry is identical across levels. Work pauses during gestures and while hidden;
  allocations are bounded by a 42 MiB cache and cancelled when leaving the scene.
- The flowing sky uses up to 700,000 pixels and reduces its resolution after sustained
  missed frames. It runs at about 30 fps; camera interactions can render at 60 fps.
- Easing uses elapsed time. Hidden tabs stop work without advancing the animation phase.
- WebGL loss reveals the gradient fallback. A restored context paints before fading in.
- Fonts and their language subsets are served locally, with the SIL licenses included.

GitHub Pages is the browser-local edition. The hosted app uses the same source plus
the existing authenticated backend and account storage for automatic device sync.
