import assert from 'node:assert/strict';
import {advanceCubeRotation, type CubeAngles} from '../lib/public-experience/cube-motion';

// A full cycle must travel through 360 degrees on all axes, not only yaw with small tilts.
let reference: CubeAngles | undefined;
for (const fps of [24, 60, 120]) {
  let angles: CubeAngles = [0, 0, 0];
  for (let frame = 0; frame < fps * 100; frame++) {
    const next = advanceCubeRotation(angles, frame / fps, 1 / fps);
    next.forEach((angle, axis) => {
      assert.ok(angle > angles[axis], `Axis ${axis} must keep travelling at ${fps}fps`);
      assert.ok(angle - angles[axis] < .008, 'No angular jumps');
    });
    angles = next;
  }
  angles.forEach((angle, axis) => assert.ok(angle > Math.PI * 2, `Axis ${axis} must complete a full turn`));
  if (reference) angles.forEach((angle, axis) => assert.ok(Math.abs(angle - reference![axis]) < .005, 'Frame rate must not change rotation speed'));
  reference = angles;
  assert.deepEqual(advanceCubeRotation(angles, 100, 0), angles, 'Zero elapsed time keeps the pose');
}
console.log('PASS full 360-degree travel on all three axes, smooth steps, frame-rate consistency and zero-time stability');
