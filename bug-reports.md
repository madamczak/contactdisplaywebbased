# Bug Reports

## BUG-1: Photo paper – displayed photo stays red after leaving safety mode view

- **Area:** Photo paper mode, safety mode
- **Steps to reproduce:**
  1. Open Photo paper mode.
  2. Enable safety mode (the photo turns red – expected).
  3. Press "Display photo".
- **Actual result:** The photo is still displayed in red.
- **Expected result:** When displaying, the photo should be black and white (no red tint).

## BUG-2: Vertical (portrait) photos are not rotated to fit paper

- **Area:** Gum bichromate mode and Photo paper mode
- **Steps to reproduce:**
  1. Open Gum bichromate or Photo paper mode.
  2. Load a vertical (portrait) photo.
- **Actual result:** The photo is shown in portrait orientation and does not fill the paper area.
- **Expected result:** The photo is automatically rotated (90°) so it fills the entire paper size, since the whole layout is set up for horizontal (landscape) orientation.

## BUG-3: Photo paper safety mode – white text fragments remain

- **Area:** Photo paper mode, safety mode
- **Steps to reproduce:**
  1. Open Photo paper mode.
  2. Enable safety mode.
- **Actual result:** Some text fragments (e.g. "Pre-display black") are still white.
- **Expected result:** All text is rendered in the safety (red) color scheme, with no white elements.

## BUG-4: Photo paper safety mode – range inputs are white

- **Area:** Photo paper mode, safety mode
- **Steps to reproduce:**
  1. Open Photo paper mode.
  2. Enable safety mode.
- **Actual result:** Range inputs (sliders) are white.
- **Expected result:** Range inputs use the red safety color scheme.

