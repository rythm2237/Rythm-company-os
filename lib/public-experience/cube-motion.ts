export type CubeAngles = [number, number, number];

/** Unbounded three-axis travel: every axis completes full turns, at gently changing rates. */
export function advanceCubeRotation([pitch, yaw, roll]: CubeAngles, time: number, dt: number): CubeAngles {
  return [
    pitch + dt * (.115 + .025 * Math.sin(time * .23)),
    yaw + dt * (.14 + .035 * Math.cos(time * .19)),
    roll + dt * (.09 + .025 * Math.sin(time * .17)),
  ];
}
