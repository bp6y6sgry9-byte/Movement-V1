"use client";

import {
  ChangeEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PoseOverlay, {
  type PoseOverlayMode,
} from "@/components/PoseOverlay";
import {
  analyzeMovement,
  recomputeMovementResult,
  type Keyframe,
  type MovementId,
  type MovementResult,
  type SlotId,
} from "@/lib/movement-analysis";
import {
  adjacentPoseFrameTime,
  analyzePoseClip,
  type PoseClipAnalysis,
} from "@/lib/pose-engine";

const EstimatedPose3D = lazy(
  () =>
    import(
      "@/components/EstimatedPose3D"
    ),
);

type WorkspaceView =
  | "athletes"
  | "review"
  | "intake"
  | "report";

type OverlayMode = PoseOverlayMode;

type Athlete = {
  id: number;
  name: string;
  level:
    | "Middle School"
    | "High School"
    | "College"
    | "Pro";
  bats:
    | "Right"
    | "Left"
    | "Switch";
  assessmentType:
    | "Baseline"
    | "Reassessment";
  team: string;
  graduationYear: string;
  painStatus: "No" | "Yes";
  painNote: string;
  coachNotes: string;
  createdAt: string;
};

type AthleteForm = Omit<
  Athlete,
  "id" | "createdAt"
>;

const blankAthleteForm: AthleteForm = {
  name: "",
  level: "High School",
  bats: "Right",
  assessmentType: "Baseline",
  team: "",
  graduationYear: "",
  painStatus: "No",
  painNote: "",
  coachNotes: "",
};

type Movement = {
  id: MovementId;
  number: string;
  name: string;
  short: string;
  purpose: string;
  instructions: string[];
  pillar: string;
  radarLabel: string;
  slots: VideoSlot[];
  editorTitle: string;
  benchmark: string;
};

type VideoSlot = {
  id: SlotId;
  label: string;
  shortLabel: string;
  camera: string;
};

const movements: Movement[] = [
  {
    id: "ankle-loading",
    number: "01",
    name: "Dorsiflexion Lunge",
    short: "Ankle",
    purpose:
      "How far each shin can move forward while the whole foot stays down.",
    instructions: [
      "Turn sideways to the camera.",
      "Put the test foot in front.",
      "Keep the heel down.",
      "Move the knee forward and back 3 times.",
    ],
    pillar: "Ankle Loading",
    radarLabel: "Ankle",
    slots: [
      {
        id: "left",
        label: "Left-leg video",
        shortLabel: "Left",
        camera: "Side view",
      },
      {
        id: "right",
        label: "Right-leg video",
        shortLabel: "Right",
        camera: "Side view",
      },
    ],
    editorTitle:
      "Deepest lunge keyframes",
    benchmark:
      "Review either side below 40°; review a side-to-side gap above 5°.",
  },
  {
    id: "overhead-squat",
    number: "02",
    name: "Overhead Squat",
    short: "Squat",
    purpose:
      "How the ankles, knees, hips, trunk, and arms organize together from the front.",
    instructions: [
      "Face the camera.",
      "Reach both hands over your head.",
      "Keep your whole body in the picture.",
      "Do 3 slow squats.",
    ],
    pillar: "Movement Quality",
    radarLabel: "Movement",
    slots: [
      {
        id: "front",
        label: "Front-view video",
        shortLabel: "Front",
        camera: "Front view",
      },
    ],
    editorTitle:
      "Deepest squat keyframes",
    benchmark:
      "Clean 90 · one visible compensation 60 · major or multiple compensations 30.",
  },
  {
    id: "single-leg-drop",
    number: "03",
    name: "Single-Leg Drop",
    short: "Leg Drop",
    purpose:
      "How each leg controls the knee from first contact through the landing.",
    instructions: [
      "Face the camera on one low step.",
      "Stand on the test leg.",
      "Step off and land on that same leg.",
      "Freeze like a statue. Do 3.",
    ],
    pillar: "Landing Control",
    radarLabel: "Landing",
    slots: [
      {
        id: "left",
        label: "Left-leg video",
        shortLabel: "Left",
        camera: "Front view",
      },
      {
        id: "right",
        label: "Right-leg video",
        shortLabel: "Right",
        camera: "Front view",
      },
    ],
    editorTitle:
      "Contact & deepest-landing keyframes",
    benchmark:
      "Review either side above 10° inward excursion; review a side-to-side gap above 8°.",
  },
  {
    id: "repeat-jumps",
    number: "04",
    name: "Five Repeated Jumps",
    short: "5 Jumps",
    purpose:
      "How quickly and consistently the athlete rebounds from the floor.",
    instructions: [
      "Turn sideways to the camera.",
      "Keep your hands on your hips.",
      "Jump 5 times in a row.",
      "Be quick and springy.",
    ],
    pillar: "Reactive Strength",
    radarLabel: "Reactive",
    slots: [
      {
        id: "side",
        label: "Side-view video",
        shortLabel: "Side",
        camera:
          "Side view · original slow-motion file",
      },
    ],
    editorTitle:
      "Takeoff & landing keyframes",
    benchmark:
      "Review mean RSI below 1.50. Jumps 2–5 create the four scored rebound contacts.",
  },
  {
    id: "aslr",
    number: "05",
    name: "Active Straight-Leg Raise",
    short: "Leg Raise",
    purpose:
      "How far each straight leg can actively rise while the other leg stays down.",
    instructions: [
      "Lie on your back, sideways to the camera.",
      "Keep both knees straight.",
      "Raise the test leg as high as it goes.",
      "Lower it and repeat 3 times.",
    ],
    pillar: "Hip Flexion Mobility",
    radarLabel: "Hip Mobility",
    slots: [
      {
        id: "left",
        label: "Left-leg video",
        shortLabel: "Left",
        camera: "Side view",
      },
      {
        id: "right",
        label: "Right-leg video",
        shortLabel: "Right",
        camera: "Side view",
      },
    ],
    editorTitle:
      "Top leg-raise keyframes",
    benchmark:
      "Review either side below 80°; review a side-to-side gap above 7°.",
  },
];

const videoRequirements: Record<
  string,
  {
    angle: string;
    files: string;
    check: string;
  }
> = {
  "ankle-loading": {
    angle: "Side view",
    files: "2 clips",
    check:
      "One left + one right",
  },
  "overhead-squat": {
    angle: "Front view",
    files: "1 clip",
    check:
      "Whole body and floor visible",
  },
  "single-leg-drop": {
    angle: "Front view",
    files: "2 clips",
    check:
      "Low step + full landing visible",
  },
  "repeat-jumps": {
    angle: "Side view",
    files: "1 clip",
    check:
      "Original 120/240 fps file",
  },
  aslr: {
    angle: "Side view",
    files: "2 clips",
    check:
      "Whole body on floor visible",
  },
};

const trainingByMovement: Record<
  MovementId,
  {
    name: string;
    dose: string;
    focus: string;
  }
> = {
  "ankle-loading": {
    name:
      "Knee-Over-Toe Ankle Rock",
    dose: "2 × 8 / side",
    focus:
      "Build usable ankle range for stable ground pressure during the load and stride.",
  },
  "overhead-squat": {
    name:
      "Slow Overhead Squat",
    dose: "3 × 5",
    focus:
      "Coordinate the ankles, knees, hips, trunk, and arms without rushing the pattern.",
  },
  "single-leg-drop": {
    name:
      "Single-Leg Snap-Down Hold",
    dose: "3 × 4 / side",
    focus:
      "Build lead-leg control for accepting and holding the hitter’s landing.",
  },
  "repeat-jumps": {
    name: "Low Pogo Series",
    dose: "3 × 10 sec",
    focus:
      "Make ground contacts quicker and more repeatable without chasing height.",
  },
  aslr: {
    name:
      "Active Straight-Leg Raise",
    dose: "2 × 8 / side",
    focus:
      "Build active hip-flexion range without borrowing motion from the knee or pelvis.",
  },
};

const hittingMeaningByMovement: Record<
  MovementId,
  string
> = {
  "ankle-loading":
    "The biggest movement opportunity is ankle loading, which can affect how the hitter keeps the foot down and organizes pressure during the load and stride.",
  "overhead-squat":
    "The biggest movement opportunity is whole-body coordination, which can make it harder to hold stable lower-body positions while the swing moves quickly.",
  "single-leg-drop":
    "The biggest movement opportunity is landing control, which connects directly to how the hitter accepts and stabilizes the stride leg.",
  "repeat-jumps":
    "The biggest movement opportunity is reactive strength, which reflects how quickly the hitter can rebound from the ground—not actual force production.",
  aslr:
    "The biggest movement opportunity is active hip-flexion mobility, which can affect how easily the hitter creates hip depth without borrowing motion elsewhere.",
};

type SlotStatus =
  | "idle"
  | "processing"
  | "ready"
  | "error";

type SlotState = {
  fileName: string;
  url: string;
  status: SlotStatus;
  progress: number;
  progressMessage: string;
  error: string;
  duration: number;
  frameStepSec: number;
  keyframes: Keyframe[];
  result: MovementResult | null;
  approved: boolean;
  excludedReps: number[];
};

type AssessmentStore = Record<
  string,
  Record<
    string,
    Partial<
      Record<SlotId, SlotState>
    >
  >
>;

const emptySlotState: SlotState = {
  fileName: "",
  url: "",
  status: "idle",
  progress: 0,
  progressMessage: "",
  error: "",
  duration: 0,
  frameStepSec: 1 / 30,
  keyframes: [],
  result: null,
  approved: false,
  excludedReps: [],
};

function Icon({
  name,
}: {
  name: string;
}) {
  const icons: Record<
    string,
    string
  > = {
    review: "⌁",
    athlete: "↑",
    report: "◫",
    people: "◎",
    play: "▶",
    pause: "Ⅱ",
    prev: "‹",
    next: "›",
    upload: "↑",
    check: "✓",
    refresh: "↻",
    info: "i",
    spark: "✦",
  };

  return (
    <span aria-hidden="true">
      {icons[name] ?? "•"}
    </span>
  );
}

function PoseCanvas({
  mode,
  progress,
  movement,
  dimmed = false,
}: {
  mode: OverlayMode;
  progress: number;
  movement: string;
  dimmed?: boolean;
}) {
  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const parent =
      canvas.parentElement;

    if (!parent) {
      return;
    }

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      2,
    );

    const width =
      parent.clientWidth;

    const height =
      parent.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width =
      `${width}px`;
    canvas.style.height =
      `${height}px`;

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    ctx.scale(dpr, dpr);

    ctx.clearRect(
      0,
      0,
      width,
      height,
    );

    if (!dimmed) {
      const glow =
        ctx.createRadialGradient(
          width * 0.51,
          height * 0.48,
          5,
          width * 0.51,
          height * 0.48,
          height * 0.58,
        );

      glow.addColorStop(
        0,
        "rgba(38, 196, 171, .11)",
      );

      glow.addColorStop(
        1,
        "rgba(38, 196, 171, 0)",
      );

      ctx.fillStyle = glow;

      ctx.fillRect(
        0,
        0,
        width,
        height,
      );
    }

    const pulse = Math.sin(
      progress * Math.PI * 10,
    );

    const squat =
      movement === "repeat-jumps"
        ? Math.max(
            0,
            Math.sin(
              progress *
                Math.PI *
                10,
            ),
          )
        : 0.18;

    const airborne =
      movement ===
        "repeat-jumps" &&
      pulse > 0.15
        ? -Math.abs(pulse) *
          height *
          0.07
        : 0;

    const cx = width * 0.51;

    const baseY =
      height * 0.83 +
      airborne;

    const scale = Math.min(
      width / 820,
      height / 510,
    );

    const lean =
      mode === "3d"
        ? 10
        : -6;

    const crouch =
      squat * 22 * scale;

    const p: Record<
      string,
      [number, number]
    > = {
      head: [
        cx + lean,
        baseY -
          300 * scale +
          crouch,
      ],
      neck: [
        cx + lean - 2,
        baseY -
          250 * scale +
          crouch,
      ],
      lShoulder: [
        cx - 52 * scale,
        baseY -
          238 * scale +
          crouch,
      ],
      rShoulder: [
        cx + 48 * scale,
        baseY -
          236 * scale +
          crouch,
      ],
      lElbow: [
        cx - 81 * scale,
        baseY -
          172 * scale +
          crouch,
      ],
      rElbow: [
        cx + 83 * scale,
        baseY -
          176 * scale +
          crouch,
      ],
      lWrist: [
        cx - 58 * scale,
        baseY -
          114 * scale +
          crouch,
      ],
      rWrist: [
        cx + 62 * scale,
        baseY -
          112 * scale +
          crouch,
      ],
      lHip: [
        cx - 32 * scale,
        baseY -
          135 * scale +
          crouch,
      ],
      rHip: [
        cx + 30 * scale,
        baseY -
          133 * scale +
          crouch,
      ],
      lKnee: [
        cx - 48 * scale,
        baseY -
          62 * scale +
          crouch * 0.35,
      ],
      rKnee: [
        cx + 50 * scale,
        baseY -
          61 * scale +
          crouch * 0.35,
      ],
      lAnkle: [
        cx - 42 * scale,
        baseY - 6,
      ],
      rAnkle: [
        cx + 43 * scale,
        baseY - 6,
      ],
      lToe: [
        cx - 66 * scale,
        baseY + 3,
      ],
      rToe: [
        cx + 67 * scale,
        baseY + 3,
      ],
    };

    if (mode === "3d") {
      p.rShoulder[0] +=
        26 * scale;
      p.rHip[0] +=
        18 * scale;
      p.rKnee[0] +=
        14 * scale;
      p.rAnkle[0] +=
        10 * scale;
    }

    const links = [
      ["head", "neck"],
      ["neck", "lShoulder"],
      ["neck", "rShoulder"],
      [
        "lShoulder",
        "rShoulder",
      ],
      [
        "lShoulder",
        "lElbow",
      ],
      ["lElbow", "lWrist"],
      [
        "rShoulder",
        "rElbow",
      ],
      ["rElbow", "rWrist"],
      ["lShoulder", "lHip"],
      ["rShoulder", "rHip"],
      ["lHip", "rHip"],
      ["lHip", "lKnee"],
      ["rHip", "rKnee"],
      ["lKnee", "lAnkle"],
      ["rKnee", "rAnkle"],
      ["lAnkle", "lToe"],
      ["rAnkle", "rToe"],
    ];

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    links.forEach(
      ([a, b], index) => {
        ctx.beginPath();
        ctx.moveTo(...p[a]);
        ctx.lineTo(...p[b]);

        ctx.lineWidth =
          mode === "skeleton"
            ? 4
            : 3;

        ctx.strokeStyle =
          index % 3 === 0
            ? "#f39a4a"
            : "#56cdb8";

        ctx.globalAlpha =
          dimmed
            ? 0.35
            : 0.92;

        ctx.stroke();
      },
    );

    Object.entries(p).forEach(
      (
        [key, [x, y]],
        index,
      ) => {
        ctx.beginPath();

        ctx.arc(
          x,
          y,
          key === "head"
            ? 10
            : 6,
          0,
          Math.PI * 2,
        );

        ctx.fillStyle =
          index % 4 === 0
            ? "#f39a4a"
            : "#59d2bd";

        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle =
          "#dffaf5";
        ctx.stroke();
      },
    );

    ctx.globalAlpha = 0.55;
    ctx.beginPath();

    ctx.moveTo(
      width * 0.22,
      baseY + 7,
    );

    ctx.lineTo(
      width * 0.79,
      baseY + 7,
    );

    ctx.strokeStyle =
      "#63817f";

    ctx.lineWidth = 1;
    ctx.setLineDash([7, 7]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (mode === "3d") {
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle =
        "#f39a4a";

      for (
        let i = 0;
        i < 3;
        i += 1
      ) {
        ctx.beginPath();

        ctx.ellipse(
          cx,
          baseY + 8,
          90 + i * 22,
          22 + i * 6,
          0,
          0,
          Math.PI * 2,
        );

        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }, [
    mode,
    progress,
    movement,
    dimmed,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="pose-canvas"
      aria-label="Markerless body tracking overlay"
    />
  );
}

function RadarChart({
  scores,
}: {
  scores: number[];
}) {
  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      2,
    );

    const size = 310;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width =
      `${size}px`;
    canvas.style.height =
      `${size}px`;

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    ctx.scale(dpr, dpr);

    const center = size / 2;
    const radius = 108;
    const count = scores.length;

    const point = (
      index: number,
      factor: number,
    ) => {
      const angle =
        -Math.PI / 2 +
        (index *
          Math.PI *
          2) /
          count;

      return [
        center +
          Math.cos(angle) *
            radius *
            factor,
        center +
          Math.sin(angle) *
            radius *
            factor,
      ] as [number, number];
    };

    ctx.clearRect(
      0,
      0,
      size,
      size,
    );

    for (
      let ring = 1;
      ring <= 4;
      ring += 1
    ) {
      ctx.beginPath();

      for (
        let i = 0;
        i < count;
        i += 1
      ) {
        const [x, y] = point(
          i,
          ring / 4,
        );

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.closePath();

      ctx.strokeStyle =
        "rgba(161, 189, 185, .2)";

      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (
      let i = 0;
      i < count;
      i += 1
    ) {
      const [x, y] =
        point(i, 1);

      ctx.beginPath();

      ctx.moveTo(
        center,
        center,
      );

      ctx.lineTo(x, y);

      ctx.strokeStyle =
        "rgba(161, 189, 185, .14)";

      ctx.stroke();
    }

    const fill =
      ctx.createRadialGradient(
        center,
        center,
        4,
        center,
        center,
        radius,
      );

    fill.addColorStop(
      0,
      "rgba(87, 211, 188, .5)",
    );

    fill.addColorStop(
      1,
      "rgba(87, 211, 188, .12)",
    );

    ctx.beginPath();

    scores.forEach(
      (score, i) => {
        const [x, y] = point(
          i,
          score / 100,
        );

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      },
    );

    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.strokeStyle =
      "#5ad5bd";

    ctx.lineWidth = 2.5;
    ctx.stroke();

    scores.forEach(
      (score, i) => {
        const [x, y] = point(
          i,
          score / 100,
        );

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          4,
          0,
          Math.PI * 2,
        );

        ctx.fillStyle =
          "#0d1b1c";

        ctx.fill();

        ctx.lineWidth = 2;

        ctx.strokeStyle =
          "#f4a45b";

        ctx.stroke();
      },
    );
  }, [scores]);

  return (
    <canvas
      ref={canvasRef}
      className="radar-canvas"
      aria-label="Five pillar movement score chart"
    />
  );
}

function formatTime(
  seconds: number,
) {
  if (
    !Number.isFinite(seconds)
  ) {
    return "0.000";
  }

  return seconds.toFixed(3);
}

function confidenceLabel(
  score: number,
) {
  if (score >= 90) {
    return "High confidence";
  }

  if (score >= 75) {
    return "Review suggested";
  }

  return "Coach review";
}

type MovementSummary = {
  movement: Movement;
  complete: boolean;
  approved: boolean;
  score: number;
  status: MovementResult["status"];
  deficiency: boolean;
  result: MovementResult | null;
  leftResult: MovementResult | null;
  rightResult: MovementResult | null;
  sideGap: number | null;
};

function summarizeMovement(
  movement: Movement,
  athleteAssessment: Record<
    string,
    Partial<
      Record<
        SlotId,
        SlotState
      >
    >
  >,
): MovementSummary {
  const states =
    movement.slots.map(
      (slot) =>
        athleteAssessment[
          movement.id
        ]?.[slot.id],
    );

  const results = states.map(
    (state) =>
      state?.result ?? null,
  );

  const complete =
    states.every(
      (state) =>
        state?.status ===
          "ready" &&
        Boolean(
          state.result?.scorable,
        ),
    );

  const approved =
    complete &&
    states.every(
      (state) =>
        state?.approved,
    );

  const validResults =
    results.filter(
      (
        result,
      ): result is MovementResult =>
        Boolean(
          result?.scorable,
        ),
    );

  const reliableResults =
    validResults.filter(
      (result) =>
        result.confidence >= 60,
    );

  const scoringResults =
    reliableResults.length
      ? reliableResults
      : validResults;

  const score =
    scoringResults.length
      ? Math.round(
          meanNumbers(
            scoringResults.map(
              (result) =>
                result.score,
            ),
          ),
        )
      : 0;

  const representative =
    scoringResults.length > 0
      ? [...scoringResults].sort(
          (
            first,
            second,
          ) =>
            first.score -
            second.score,
        )[0]
      : null;

  const leftResult =
    athleteAssessment[
      movement.id
    ]?.left?.result ?? null;

  const rightResult =
    athleteAssessment[
      movement.id
    ]?.right?.result ?? null;

  const sideGap =
    leftResult &&
    rightResult &&
    leftResult.confidence >= 60 &&
    rightResult.confidence >= 60
      ? Math.abs(
          leftResult.rawValue -
            rightResult.rawValue,
        )
      : null;

  return {
    movement,
    complete,
    approved,
    score,
    status:
      scoringResults.length === 0
        ? "Review"
        : score >= 80
          ? "Strong"
          : score >= 60
            ? "Developing"
            : "Priority",
    deficiency:
      scoringResults.some(
        (result) =>
          result.deficiency,
      ),
    result: representative,
    leftResult,
    rightResult,
    sideGap,
  };
}

function meanNumbers(
  values: number[],
) {
  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    Math.max(1, values.length)
  );
}

function clampNumber(
  value: number,
  minimum: number,
  maximum: number,
) {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      value,
    ),
  );
}

function formatMeasurement(
  value: number,
  digits = 1,
) {
  return Number.isFinite(value)
    ? value.toFixed(digits)
    : "—";
}

function formatRepValue(
  value:
    | number
    | null
    | undefined,
  unit: string,
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  const digits =
    unit === "s"
      ? 3
      : unit === "m/s"
        ? 2
        : 1;

  return `${value.toFixed(
    digits,
  )}${unit}`;
}

export default function Home() {
  const [view, setView] =
    useState<WorkspaceView>(
      "athletes",
    );

  const [athletes, setAthletes] =
    useState<Athlete[]>([]);

  const [
    activeAthleteId,
    setActiveAthleteId,
  ] = useState<number | null>(
    null,
  );

  const [
    athleteForm,
    setAthleteForm,
  ] = useState<AthleteForm>(
    blankAthleteForm,
  );

  const [
    athletesLoading,
    setAthletesLoading,
  ] = useState(true);

  const [
    athleteSaving,
    setAthleteSaving,
  ] = useState(false);

  const [
    athleteError,
    setAthleteError,
  ] = useState("");

  const [
    activeMovementId,
    setActiveMovementId,
  ] = useState<MovementId>(
    "repeat-jumps",
  );

  const [
    activeSlotId,
    setActiveSlotId,
  ] = useState<SlotId>(
    "side",
  );

  const [
    overlayMode,
    setOverlayMode,
  ] = useState<OverlayMode>(
    "video",
  );

  const [
    assessmentStore,
    setAssessmentStore,
  ] = useState<AssessmentStore>(
    {},
  );

  const [
    selectedMarkerId,
    setSelectedMarkerId,
  ] = useState("");

  const [
    isPlaying,
    setIsPlaying,
  ] = useState(false);

  const [
    progress,
    setProgress,
  ] = useState(0);

  const [toast, setToast] =
    useState("");

  const videoRef =
    useRef<HTMLVideoElement>(null);

  const timelineRef =
    useRef<HTMLDivElement>(null);

  const uploadRef =
    useRef<HTMLInputElement>(null);

  const assessmentStoreRef =
    useRef<AssessmentStore>({});

  const poseCacheRef =
    useRef<
      Record<
        string,
        PoseClipAnalysis
      >
    >({});

  const abortControllersRef =
    useRef<
      Record<
        string,
        AbortController
      >
    >({});

  const analysisRequestRef =
    useRef<
      Record<string, number>
    >({});

  const activeAthlete =
    athletes.find(
      (athlete) =>
        athlete.id ===
        activeAthleteId,
    ) ?? null;

  const athleteKey =
    activeAthleteId === null
      ? ""
      : String(activeAthleteId);

  const athleteAssessment =
    useMemo(
      () =>
        athleteKey
          ? assessmentStore[
              athleteKey
            ] ?? {}
          : {},
      [
        assessmentStore,
        athleteKey,
      ],
    );

  const activeMovement =
    movements.find(
      (movement) =>
        movement.id ===
        activeMovementId,
    ) ?? movements[3];

  const activeSlotDefinition =
    activeMovement.slots.find(
      (slot) =>
        slot.id ===
        activeSlotId,
    ) ??
    activeMovement.slots[0];

  const activeSlotState =
    athleteAssessment[
      activeMovementId
    ]?.[
      activeSlotDefinition.id
    ] ?? emptySlotState;

  const activeResult =
    activeSlotState.result;

  const activeVideoUrl =
    activeSlotState.url || null;

  const activeVideoName =
    activeSlotState.fileName;

  const duration =
    activeSlotState.duration;

  const markers =
    activeSlotState.keyframes;

  const selectedMarker =
    markers.find(
      (marker) =>
        marker.id ===
        selectedMarkerId,
    ) ??
    markers[0] ??
    null;

  const verified =
    activeSlotState.approved;

  const isActiveAnalyzing =
    activeSlotState.status ===
    "processing";

  const activeCacheKey =
    `${athleteKey}:${activeMovementId}:${activeSlotDefinition.id}`;

  const activePoseClip =
    poseCacheRef.current[
      activeCacheKey
    ] ?? null;

  const movementSummaries =
    useMemo(
      () =>
        movements.map(
          (movement) =>
            summarizeMovement(
              movement,
              athleteAssessment,
            ),
        ),
      [athleteAssessment],
    );

  const uploadedMovementCount =
    movements.filter((movement) =>
      movement.slots.every(
        (slot) =>
          Boolean(
            athleteAssessment[
              movement.id
            ]?.[slot.id]?.url,
          ),
      ),
    ).length;

  const verifiedMovementCount =
    movementSummaries.filter(
      (summary) =>
        summary.approved,
    ).length;

  const reportReady =
    movementSummaries.every(
      (summary) =>
        summary.approved,
    );

  const overallScore =
    reportReady
      ? Math.round(
          meanNumbers(
            movementSummaries.map(
              (summary) =>
                summary.score,
            ),
          ),
        )
      : 0;

  const prioritySummary = [
    ...movementSummaries,
  ].sort(
    (first, second) =>
      first.score -
      second.score,
  )[0];

  const trainingPlan = [
    ...movementSummaries,
  ]
    .sort(
      (first, second) =>
        first.score -
        second.score,
    )
    .slice(0, 3)
    .map(
      (summary, index) => ({
        number: String(
          index + 1,
        ).padStart(2, "0"),
        ...trainingByMovement[
          summary.movement.id
        ],
      }),
    );

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout =
      window.setTimeout(
        () => setToast(""),
        2800,
      );

    return () =>
      window.clearTimeout(
        timeout,
      );
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/athletes")
      .then(async (response) => {
        const payload =
          (await response.json()) as {
            athletes?: Athlete[];
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            payload.error ??
              "Could not load athletes.",
          );
        }

        if (!cancelled) {
          setAthletes(
            payload.athletes ??
              [],
          );
        }
      })
      .catch(
        (error: unknown) => {
          if (!cancelled) {
            setAthleteError(
              error instanceof Error
                ? error.message
                : "Could not load athletes.",
            );
          }
        },
      )
      .finally(() => {
        if (!cancelled) {
          setAthletesLoading(
            false,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    assessmentStoreRef.current =
      assessmentStore;
  }, [assessmentStore]);

  useEffect(() => {
    if (markers.length === 0) {
      setSelectedMarkerId("");
      return;
    }

    if (
      !markers.some(
        (marker) =>
          marker.id ===
          selectedMarkerId,
      )
    ) {
      setSelectedMarkerId(
        markers[0].id,
      );
    }
  }, [
    markers,
    selectedMarkerId,
  ]);

  useEffect(() => {
    const abortControllers =
      abortControllersRef.current;

    const storeRef =
      assessmentStoreRef;

    return () => {
      Object.values(
        abortControllers,
      ).forEach(
        (controller) =>
          controller.abort(),
      );

      Object.values(
        storeRef.current,
      ).forEach(
        (
          athleteMovements,
        ) => {
          Object.values(
            athleteMovements,
          ).forEach(
            (
              movementSlots,
            ) => {
              Object.values(
                movementSlots,
              ).forEach(
                (slot) => {
                  if (slot?.url) {
                    URL.revokeObjectURL(
                      slot.url,
                    );
                  }
                },
              );
            },
          );
        },
      );
    };
  }, []);

  const setSlotState = (
    targetAthleteKey: string,
    movementId: MovementId,
    slotId: SlotId,
    updater: (
      slot: SlotState,
    ) => SlotState,
  ) => {
    setAssessmentStore(
      (current) => {
        const athleteMovements =
          current[
            targetAthleteKey
          ] ?? {};

        const movementSlots =
          athleteMovements[
            movementId
          ] ?? {};

        const previous =
          movementSlots[
            slotId
          ] ?? {
            ...emptySlotState,
          };

        return {
          ...current,
          [targetAthleteKey]: {
            ...athleteMovements,
            [movementId]: {
              ...movementSlots,
              [slotId]:
                updater(
                  previous,
                ),
            },
          },
        };
      },
    );
  };

  const seek = (
    nextProgress: number,
  ) => {
    const clamped = Math.min(
      1,
      Math.max(
        0,
        nextProgress,
      ),
    );

    setProgress(clamped);

    if (
      videoRef.current &&
      Number.isFinite(
        videoRef.current
          .duration,
      )
    ) {
      videoRef.current.currentTime =
        clamped *
        videoRef.current.duration;
    }
  };

  const togglePlay =
    async () => {
      if (
        videoRef.current &&
        activeVideoUrl
      ) {
        if (
          videoRef.current.paused
        ) {
          await videoRef.current.play();
          setIsPlaying(true);
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
        }

        return;
      }
    };

  const updateKeyframeTime = (
    markerId: string,
    timeSec: number,
  ) => {
    if (
      !athleteKey ||
      !activePoseClip
    ) {
      return;
    }

    const safeTime =
      clampNumber(
        timeSec,
        0,
        activePoseClip.duration,
      );

    setSlotState(
      athleteKey,
      activeMovementId,
      activeSlotDefinition.id,
      (slot) => {
        const nextKeyframes =
          slot.keyframes.map(
            (marker) =>
              marker.id ===
              markerId
                ? {
                    ...marker,
                    timeSec:
                      safeTime,
                    coachAdjusted:
                      Math.abs(
                        safeTime -
                          marker.autoTimeSec,
                      ) >
                      0.0005,
                  }
                : marker,
          );

        return {
          ...slot,
          keyframes:
            nextKeyframes,
          result:
            recomputeMovementResult(
              activeMovementId,
              activeSlotDefinition.id,
              activePoseClip,
              nextKeyframes,
              slot.excludedReps,
            ),
          approved: false,
        };
      },
    );
  };

  const nudge = (
    direction: -1 | 1,
  ) => {
    if (
      !selectedMarker ||
      !activePoseClip ||
      duration <= 0
    ) {
      return;
    }

    const nextTime =
      adjacentPoseFrameTime(
        activePoseClip.frames,
        selectedMarker.timeSec,
        direction,
      );

    updateKeyframeTime(
      selectedMarker.id,
      nextTime,
    );

    seek(
      nextTime / duration,
    );
  };

  const beginDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    markerId: string,
  ) => {
    event.preventDefault();

    setSelectedMarkerId(
      markerId,
    );

    const move = (
      pointerEvent: PointerEvent,
    ) => {
      if (
        !timelineRef.current ||
        duration <= 0
      ) {
        return;
      }

      const rect =
        timelineRef.current.getBoundingClientRect();

      const pct = Math.min(
        99,
        Math.max(
          1,
          ((pointerEvent.clientX -
            rect.left) /
            rect.width) *
            100,
        ),
      );

      updateKeyframeTime(
        markerId,
        (pct / 100) *
          duration,
      );

      seek(pct / 100);
    };

    const end = () => {
      window.removeEventListener(
        "pointermove",
        move,
      );

      window.removeEventListener(
        "pointerup",
        end,
      );
    };

    window.addEventListener(
      "pointermove",
      move,
    );

    window.addEventListener(
      "pointerup",
      end,
    );
  };

  const runAnalysisForSlot =
    async (
      targetAthleteKey: string,
      movementId: MovementId,
      slotId: SlotId,
      url: string,
      requestId: number,
    ) => {
      const cacheKey =
        `${targetAthleteKey}:${movementId}:${slotId}`;

      const controller =
        new AbortController();

      abortControllersRef.current[
        cacheKey
      ]?.abort();

      abortControllersRef.current[
        cacheKey
      ] = controller;

      setSlotState(
        targetAthleteKey,
        movementId,
        slotId,
        (slot) => ({
          ...slot,
          status:
            "processing",
          progress: 2,
          progressMessage:
            "Waiting to analyze…",
          error: "",
          result: null,
          keyframes: [],
          approved: false,
        }),
      );

      try {
        const clip =
          await analyzePoseClip(
            url,
            {
              movementId,
              signal:
                controller.signal,
              onProgress: ({
                percent,
                message,
              }) => {
                if (
                  analysisRequestRef.current[
                    cacheKey
                  ] !==
                  requestId
                ) {
                  return;
                }

                setSlotState(
                  targetAthleteKey,
                  movementId,
                  slotId,
                  (slot) => ({
                    ...slot,
                    progress:
                      percent,
                    progressMessage:
                      message,
                  }),
                );
              },
            },
          );

        if (
          analysisRequestRef.current[
            cacheKey
          ] !== requestId
        ) {
          return;
        }

        const output =
          analyzeMovement(
            movementId,
            slotId,
            clip,
          );

        poseCacheRef.current[
          cacheKey
        ] = clip;

        setSlotState(
          targetAthleteKey,
          movementId,
          slotId,
          (slot) => ({
            ...slot,
            status: "ready",
            progress: 100,
            progressMessage:
              "Automatic analysis ready",
            error: "",
            duration:
              clip.duration,
            frameStepSec:
              clip.frameStepSec,
            keyframes:
              output.keyframes,
            result:
              output.result,
            approved: false,
            excludedReps: [],
          }),
        );

        const movementName =
          movements.find(
            (movement) =>
              movement.id ===
              movementId,
          )?.name ??
          "movement";

        const slotName =
          movements
            .find(
              (movement) =>
                movement.id ===
                movementId,
            )
            ?.slots.find(
              (slot) =>
                slot.id ===
                slotId,
            )?.shortLabel ??
          "video";

        setToast(
          `${movementName} · ${slotName} analysis is ready to review.`,
        );
      } catch (error) {
        if (
          error instanceof
            DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        if (
          analysisRequestRef.current[
            cacheKey
          ] !== requestId
        ) {
          return;
        }

        setSlotState(
          targetAthleteKey,
          movementId,
          slotId,
          (slot) => ({
            ...slot,
            status: "error",
            progress: 0,
            progressMessage: "",
            error:
              error instanceof
              Error
                ? error.message
                : "This video could not be analyzed.",
            result: null,
            keyframes: [],
            approved: false,
          }),
        );
      } finally {
        if (
          abortControllersRef.current[
            cacheKey
          ] === controller
        ) {
          delete abortControllersRef.current[
            cacheKey
          ];
        }
      }
    };

  const handleVideoUpload = (
    event: ChangeEvent<HTMLInputElement>,
    movementId: MovementId =
      activeMovementId,
    slotId: SlotId =
      activeSlotDefinition.id,
    openReview = true,
  ) => {
    if (
      !athleteKey ||
      !activeAthlete
    ) {
      setView("athletes");

      setToast(
        "Choose an athlete before adding videos.",
      );

      return;
    }

    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith(
        "video/",
      ) &&
      !/\.(mp4|mov|m4v|qt)$/i.test(
        file.name,
      )
    ) {
      setToast(
        "Choose a MOV, MP4, M4V, or other playable video file.",
      );

      return;
    }

    const cacheKey =
      `${athleteKey}:${movementId}:${slotId}`;

    abortControllersRef.current[
      cacheKey
    ]?.abort();

    delete abortControllersRef.current[
      cacheKey
    ];

    if (
      videoRef.current &&
      movementId ===
        activeMovementId &&
      slotId ===
        activeSlotDefinition.id
    ) {
      videoRef.current.pause();
    }

    const previousUrl =
      assessmentStore[
        athleteKey
      ]?.[movementId]?.[
        slotId
      ]?.url;

    if (previousUrl) {
      URL.revokeObjectURL(
        previousUrl,
      );
    }

    const url =
      URL.createObjectURL(file);

    delete poseCacheRef.current[
      cacheKey
    ];

    const requestId =
      (analysisRequestRef.current[
        cacheKey
      ] ?? 0) + 1;

    analysisRequestRef.current[
      cacheKey
    ] = requestId;

    setSlotState(
      athleteKey,
      movementId,
      slotId,
      () => ({
        ...emptySlotState,
        fileName: file.name,
        url,
        status: "processing",
        progress: 1,
        progressMessage:
          "Reading video…",
      }),
    );

    if (openReview) {
      setView("review");
      setActiveMovementId(
        movementId,
      );
      setActiveSlotId(
        slotId,
      );
      setProgress(0);
      setIsPlaying(false);
    }

    void runAnalysisForSlot(
      athleteKey,
      movementId,
      slotId,
      url,
      requestId,
    );
  };

  const runAutoDetection =
    () => {
      if (
        !athleteKey ||
        !activeVideoUrl
      ) {
        return;
      }

      const cacheKey =
        `${athleteKey}:${activeMovementId}:${activeSlotDefinition.id}`;

      const requestId =
        (analysisRequestRef.current[
          cacheKey
        ] ?? 0) + 1;

      analysisRequestRef.current[
        cacheKey
      ] = requestId;

      delete poseCacheRef.current[
        cacheKey
      ];

      setProgress(0);

      void runAnalysisForSlot(
        athleteKey,
        activeMovementId,
        activeSlotDefinition.id,
        activeVideoUrl,
        requestId,
      );
    };

  const resetSelected = () => {
    if (
      !selectedMarker ||
      duration <= 0
    ) {
      return;
    }

    updateKeyframeTime(
      selectedMarker.id,
      selectedMarker.autoTimeSec,
    );

    seek(
      selectedMarker.autoTimeSec /
        duration,
    );

    setToast(
      `${selectedMarker.label} returned to the automatic frame.`,
    );
  };

  const approve = () => {
    if (
      !athleteKey ||
      !activeSlotState.result
    ) {
      return;
    }

    if (
      !activeSlotState.result
        .scorable
    ) {
      setToast(
        "Check the suggested event markers before approving this analysis.",
      );

      return;
    }

    setSlotState(
      athleteKey,
      activeMovementId,
      activeSlotDefinition.id,
      (slot) => ({
        ...slot,
        approved: true,
      }),
    );

    setToast(
      `${activeSlotDefinition.shortLabel} analysis approved.`,
    );
  };

  const toggleRep = (
    rep: number,
  ) => {
    if (
      !athleteKey ||
      !activePoseClip
    ) {
      return;
    }

    setSlotState(
      athleteKey,
      activeMovementId,
      activeSlotDefinition.id,
      (slot) => {
        const excludedReps =
          slot.excludedReps.includes(
            rep,
          )
            ? slot.excludedReps.filter(
                (
                  currentRep,
                ) =>
                  currentRep !==
                  rep,
              )
            : [
                ...slot.excludedReps,
                rep,
              ];

        return {
          ...slot,
          excludedReps,
          result:
            recomputeMovementResult(
              activeMovementId,
              activeSlotDefinition.id,
              activePoseClip,
              slot.keyframes,
              excludedReps,
            ),
          approved: false,
        };
      },
    );
  };

  const stepVideo = (
    direction: -1 | 1,
  ) => {
    if (
      !activePoseClip ||
      duration <= 0
    ) {
      return;
    }

    const nextTime =
      adjacentPoseFrameTime(
        activePoseClip.frames,
        progress * duration,
        direction,
      );

    seek(
      nextTime / duration,
    );
  };

  const selectAthlete = (
    athlete: Athlete,
    destination: WorkspaceView =
      "intake",
  ) => {
    setActiveAthleteId(
      athlete.id,
    );

    setActiveMovementId(
      "repeat-jumps",
    );

    setActiveSlotId("side");
    setProgress(0);
    setIsPlaying(false);
    setView(destination);
  };

  const createAthlete =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();
      setAthleteSaving(true);
      setAthleteError("");

      try {
        const response =
          await fetch(
            "/api/athletes",
            {
              method: "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body: JSON.stringify(
                athleteForm,
              ),
            },
          );

        const payload =
          (await response.json()) as {
            athlete?: Athlete;
            error?: string;
          };

        if (
          !response.ok ||
          !payload.athlete
        ) {
          throw new Error(
            payload.error ??
              "Could not save the athlete.",
          );
        }

        setAthletes(
          (current) => [
            payload.athlete as Athlete,
            ...current,
          ],
        );

        setAthleteForm(
          blankAthleteForm,
        );

        selectAthlete(
          payload.athlete as Athlete,
        );

        setToast(
          `${payload.athlete.name} was added. You can add their videos now.`,
        );
      } catch (error) {
        setAthleteError(
          error instanceof Error
            ? error.message
            : "Could not save the athlete.",
        );
      } finally {
        setAthleteSaving(false);
      }
    };

  const mainNav = [
    { id: "athletes" as const, label: "Athletes", icon: "people" },
    { id: "review" as const, label: "Review", icon: "review" },
    { id: "intake" as const, label: "Add Videos", icon: "athlete" },
    { id: "report" as const, label: "Report", icon: "report" },
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("athletes")} aria-label="SwingLab Movement home">
          <span className="brand-mark">SL</span>
          <span className="brand-copy">
            <strong>SWINGLAB</strong>
            <small>MOVEMENT</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="Main navigation">
          <p className="eyebrow nav-label">Workspace</p>
          {mainNav.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              onClick={() => {
                if (item.id !== "athletes" && !activeAthlete) {
                  setView("athletes");
                  setToast("Choose or create an athlete first.");
                  return;
                }
                setView(item.id);
              }}
            >
              <span className="nav-icon">
                <Icon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="baseline-note">
            <span className="baseline-icon">
              <Icon name="spark" />
            </span>
            <div>
              <strong>{activeAthlete ? activeAthlete.assessmentType : "No athlete selected"}</strong>
              <small>{activeAthlete ? activeAthlete.name : "Choose an athlete"}</small>
            </div>
          </div>

          <div className="coach-card">
            <span className="avatar">JO</span>
            <span>
              <strong>Jordan Overton</strong>
              <small>Biomechanics Coach</small>
            </span>
            <span className="more">•••</span>
          </div>
        </div>
      </aside>

      <section className="content-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {view === "athletes"
                ? "Athlete management"
                : view === "intake"
                  ? "Coach video intake"
                  : "Remote assessment"}
            </p>

            <h1>
              {view === "athletes" && "Athletes"}
              {view === "review" && "Review Analysis"}
              {view === "intake" && "Add Athlete Videos"}
              {view === "report" && "Movement Report"}
            </h1>
          </div>

          <button
            className={activeAthlete ? "athlete-chip" : "athlete-chip empty"}
            onClick={() => setView("athletes")}
          >
            <span className="athlete-avatar">
              {activeAthlete
                ? activeAthlete.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("")
                : "+"}
            </span>

            <span>
              <strong>{activeAthlete?.name ?? "No athlete selected"}</strong>
              <small>
                {activeAthlete
                  ? `${
                      activeAthlete.bats === "Switch"
                        ? "Switch hitter"
                        : `${activeAthlete.bats}-handed hitter`
                    } · ${activeAthlete.level}`
                  : "Choose or create an athlete"}
              </small>
            </span>

            <span className="chip-arrow">⌄</span>
          </button>
        </header>

        {view === "athletes" && (
          <div className="athletes-page">
            <section className="athletes-hero">
              <div>
                <span className="step-pill">Start every assessment here</span>
                <h2>Choose an athlete or add someone new.</h2>
                <p>
                  Athlete profiles keep every video, assessment, and reassessment
                  organized under the correct person.
                </p>
              </div>

              <div className="profile-field-summary">
                <p className="eyebrow">Profile information</p>
                <span>
                  <Icon name="check" /> Name, level, and batting side
                </span>
                <span>
                  <Icon name="check" /> Team and graduation year are optional
                </span>
                <span>
                  <Icon name="check" /> Assessment status and coach notes
                </span>
              </div>
            </section>

            <div className="athlete-management-grid">
              <section className="athlete-directory">
                <div className="directory-head">
                  <div>
                    <p className="eyebrow">Your roster</p>
                    <h2>Athletes</h2>
                  </div>
                  <span>{athletes.length}</span>
                </div>

                {athletesLoading ? (
                  <div className="directory-empty">
                    <span className="directory-loader" />
                    <strong>Loading athletes…</strong>
                  </div>
                ) : athletes.length === 0 ? (
                  <div className="directory-empty">
                    <span className="empty-roster-icon">◎</span>
                    <strong>No athletes yet</strong>
                    <p>Add the first athlete using the form.</p>
                  </div>
                ) : (
                  <div className="athlete-list">
                    {athletes.map((athlete) => (
                      <button
                        key={athlete.id}
                        className={
                          activeAthleteId === athlete.id
                            ? "athlete-list-card active"
                            : "athlete-list-card"
                        }
                        onClick={() => selectAthlete(athlete)}
                      >
                        <span className="list-avatar">
                          {athlete.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase())
                            .join("")}
                        </span>

                        <span className="list-athlete-copy">
                          <strong>{athlete.name}</strong>
                          <small>
                            {athlete.level} ·{" "}
                            {athlete.bats === "Switch"
                              ? "Switch hitter"
                              : `Bats ${athlete.bats}`}
                          </small>
                          {athlete.team && <em>{athlete.team}</em>}
                        </span>

                        <span className="list-action">Select →</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="new-athlete-panel">
                <div className="new-athlete-head">
                  <p className="eyebrow">New profile</p>
                  <h2>Add an athlete</h2>
                  <p>
                    Only collect what helps organize and interpret the hitter’s
                    assessment.
                  </p>
                </div>

                <form className="athlete-form" onSubmit={createAthlete}>
                  <label className="form-field full">
                    <span>
                      Athlete name <b>Required</b>
                    </span>

                    <input
                      required
                      value={athleteForm.name}
                      onChange={(event) =>
                        setAthleteForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="First and last name"
                    />
                  </label>

                  <label className="form-field">
                    <span>
                      Level <b>Required</b>
                    </span>

                    <select
                      value={athleteForm.level}
                      onChange={(event) =>
                        setAthleteForm((current) => ({
                          ...current,
                          level: event.target.value as Athlete["level"],
                        }))
                      }
                    >
                      <option>Middle School</option>
                      <option>High School</option>
                      <option>College</option>
                      <option>Pro</option>
                    </select>
                  </label>

                  <label className="form-field">
                    <span>
                      Team or organization <em>Optional</em>
                    </span>

                    <input
                      value={athleteForm.team}
                      onChange={(event) =>
                        setAthleteForm((current) => ({
                          ...current,
                          team: event.target.value,
                        }))
                      }
                      placeholder="School, club, or organization"
                    />
                  </label>

                  <fieldset className="form-field full">
                    <legend>
                      Batting side <b>Required</b>
                    </legend>

                    <div className="choice-row three">
                      {(["Right", "Left", "Switch"] as Athlete["bats"][]).map(
                        (side) => (
                          <button
                            type="button"
                            key={side}
                            className={athleteForm.bats === side ? "active" : ""}
                            onClick={() =>
                              setAthleteForm((current) => ({
                                ...current,
                                bats: side,
                              }))
                            }
                          >
                            {side}
                          </button>
                        ),
                      )}
                    </div>
                  </fieldset>

                  <fieldset className="form-field">
                    <legend>
                      Assessment <b>Required</b>
                    </legend>

                    <div className="choice-row">
                      {(
                        ["Baseline", "Reassessment"] as Athlete["assessmentType"][]
                      ).map((type) => (
                        <button
                          type="button"
                          key={type}
                          className={
                            athleteForm.assessmentType === type ? "active" : ""
                          }
                          onClick={() =>
                            setAthleteForm((current) => ({
                              ...current,
                              assessmentType: type,
                            }))
                          }
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <label className="form-field">
                    <span>
                      Graduation year <em>Optional</em>
                    </span>

                    <input
                      inputMode="numeric"
                      maxLength={4}
                      value={athleteForm.graduationYear}
                      onChange={(event) =>
                        setAthleteForm((current) => ({
                          ...current,
                          graduationYear: event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 4),
                        }))
                      }
                      placeholder="Example: 2028"
                    />
                  </label>

                  <fieldset className="form-field full">
                    <legend>
                      Current pain or injury? <b>Required</b>
                    </legend>

                    <div className="choice-row">
                      {(["No", "Yes"] as Athlete["painStatus"][]).map(
                        (status) => (
                          <button
                            type="button"
                            key={status}
                            className={
                              athleteForm.painStatus === status ? "active" : ""
                            }
                            onClick={() =>
                              setAthleteForm((current) => ({
                                ...current,
                                painStatus: status,
                              }))
                            }
                          >
                            {status}
                          </button>
                        ),
                      )}
                    </div>

                    <small>
                      This is only a coaching alert—not a medical diagnosis.
                    </small>
                  </fieldset>

                  {athleteForm.painStatus === "Yes" && (
                    <label className="form-field full">
                      <span>
                        Pain or injury note <b>Required</b>
                      </span>

                      <input
                        required
                        value={athleteForm.painNote}
                        onChange={(event) =>
                          setAthleteForm((current) => ({
                            ...current,
                            painNote: event.target.value,
                          }))
                        }
                        placeholder="Briefly describe what the athlete reported"
                      />
                    </label>
                  )}

                  <label className="form-field full">
                    <span>
                      Coach notes or goals <em>Optional</em>
                    </span>

                    <textarea
                      value={athleteForm.coachNotes}
                      onChange={(event) =>
                        setAthleteForm((current) => ({
                          ...current,
                          coachNotes: event.target.value,
                        }))
                      }
                      placeholder="Anything you want to remember before reviewing the videos"
                      rows={3}
                    />
                  </label>

                  {athleteError && (
                    <p className="form-error">{athleteError}</p>
                  )}

                  <button
                    className="create-athlete-button"
                    type="submit"
                    disabled={athleteSaving}
                  >
                    {athleteSaving
                      ? "Saving athlete…"
                      : "Create athlete & add videos"}{" "}
                    <span>→</span>
                  </button>
                </form>
              </section>
            </div>
          </div>
        )}

        {view === "review" && activeAthlete && (
          <div className="review-page">
            <section
              className="movement-strip"
              aria-label="Assessment movements"
            >
              {movements.map((movement) => {
                const summary = movementSummaries.find(
                  (item) => item.movement.id === movement.id,
                );

                const hasAnyVideo = movement.slots.some((slot) =>
                  Boolean(athleteAssessment[movement.id]?.[slot.id]?.url),
                );

                return (
                  <button
                    key={movement.id}
                    className={
                      activeMovementId === movement.id
                        ? "movement-tab active"
                        : "movement-tab"
                    }
                    onClick={() => {
                      setActiveMovementId(movement.id);
                      setActiveSlotId(movement.slots[0].id);
                      setProgress(0);
                      setIsPlaying(false);
                    }}
                  >
                    <span className="movement-number">{movement.number}</span>

                    <span className="movement-tab-copy">
                      <strong>{movement.short}</strong>
                      <small>{movement.pillar}</small>
                    </span>

                    <span
                      className={`status-dot ${
                        !hasAnyVideo
                          ? "empty"
                          : summary?.approved
                            ? "ready"
                            : "needs-review"
                      }`}
                      title={
                        !hasAnyVideo
                          ? "No video added"
                          : summary?.approved
                            ? "Coach verified"
                            : "Ready for review"
                      }
                    />
                  </button>
                );
              })}
            </section>

            <div className="review-grid">
              <section className="video-workspace">
                <div className="workspace-head">
                  <div>
                    <div className="title-line">
                      <h2>{activeMovement.name}</h2>
                      {!activeVideoUrl && (
                        <span className="pill neutral">No video</span>
                      )}
                      {activeVideoUrl && isActiveAnalyzing && (
                        <span className="pill amber">Analyzing</span>
                      )}
                      {activeSlotState.status === "ready" && (
                        <span className="pill amber">AI analyzed</span>
                      )}
                      {activeSlotState.status === "error" && (
                        <span className="pill amber">Review video</span>
                      )}
                      {verified && (
                        <span className="pill green">Coach verified</span>
                      )}
                    </div>

                    <p>
                      {activeVideoName ||
                        "Nothing is analyzed until you add a video."}
                    </p>

                    {activeMovement.slots.length > 1 && (
                      <div
                        className="clip-switcher"
                        aria-label="Video clips"
                      >
                        {activeMovement.slots.map((slot) => {
                          const slotState =
                            athleteAssessment[activeMovementId]?.[slot.id];

                          return (
                            <button
                              key={slot.id}
                              className={
                                activeSlotDefinition.id === slot.id
                                  ? "active"
                                  : ""
                              }
                              onClick={() => {
                                setActiveSlotId(slot.id);
                                setProgress(0);
                                setIsPlaying(false);
                              }}
                            >
                              {slot.shortLabel}
                              {slotState?.approved ? " ✓" : ""}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="workspace-actions">
                    <button
                      className="quiet-btn"
                      onClick={() => uploadRef.current?.click()}
                    >
                      <Icon name="upload" />{" "}
                      {activeVideoUrl ? "Replace video" : "Add video"}
                    </button>

                    {activeVideoUrl && (
                      <button
                        className="quiet-btn"
                        onClick={runAutoDetection}
                        disabled={isActiveAnalyzing}
                      >
                        <Icon name="refresh" />{" "}
                        {isActiveAnalyzing
                          ? "Detecting…"
                          : "Run auto-detect"}
                      </button>
                    )}

                    <input
                      ref={uploadRef}
                      className="hidden-input"
                      type="file"
                      accept="video/*"
                      onChange={handleVideoUpload}
                    />
                  </div>
                </div>

                <div
                  className={
                    activeVideoUrl ? "video-stage" : "video-stage empty"
                  }
                >
                  <div className="stage-grid" />

                  {activeVideoUrl ? (
                    <>
                      <video
                        ref={videoRef}
                        src={activeVideoUrl}
                        playsInline
                        style={{ opacity: overlayMode === "video" ? 1 : 0 }}
                        onLoadedMetadata={(event) => {
                          const nextDuration = event.currentTarget.duration;

                          if (
                            athleteKey &&
                            Number.isFinite(nextDuration) &&
                            nextDuration > 0 &&
                            activeSlotState.duration <= 0
                          ) {
                            setSlotState(
                              athleteKey,
                              activeMovementId,
                              activeSlotDefinition.id,
                              (slot) => ({
                                ...slot,
                                duration: nextDuration,
                              }),
                            );
                          }
                        }}
                        onTimeUpdate={(event) => {
                          if (event.currentTarget.duration) {
                            setProgress(
                              event.currentTarget.currentTime /
                                event.currentTarget.duration,
                            );
                          }
                        }}
                        onEnded={() => setIsPlaying(false)}
                      />

                      {activePoseClip && overlayMode !== "3d" && (
                        <PoseOverlay
                          clip={activePoseClip}
                          mode={overlayMode}
                          videoRef={videoRef}
                        />
                      )}

                      {activePoseClip && overlayMode === "3d" && (
                        <Suspense
                          fallback={
                            <div className="estimated-3d-loading">
                              Preparing the 3D reconstruction…
                            </div>
                          }
                        >
                          <EstimatedPose3D
                            clip={activePoseClip}
                            videoRef={videoRef}
                          />
                        </Suspense>
                      )}

                      {activePoseClip && (
                        <div className="stage-badge left">
                          <span className="live-dot" />
                          Markerless tracking
                        </div>
                      )}

                      <div className="stage-badge right">VIDEO ADDED</div>
                    </>
                  ) : (
                    <div className="empty-video-state">
                      <span className="empty-upload-icon">
                        <Icon name="upload" />
                      </span>

                      <p className="eyebrow">No video added</p>

                      <h3>
                        Add {activeAthlete.name}&apos;s{" "}
                        {activeMovement.name.toLowerCase()} video
                      </h3>

                      <p>
                        Choose the{" "}
                        {activeSlotDefinition.shortLabel.toLowerCase()} clip{" "}
                        {activeAthlete.name} already sent you. Analysis begins
                        only after you add the file.
                      </p>

                      <button onClick={() => uploadRef.current?.click()}>
                        Choose video from this device
                      </button>

                      <small>
                        {activeSlotDefinition.camera} · MOV, MP4, M4V, or a
                        saved phone video
                      </small>
                    </div>
                  )}

                  {activeVideoUrl && isActiveAnalyzing && (
                    <div className="analysis-overlay">
                      <span className="scan-line" />
                      <strong>
                        {activeSlotState.progressMessage ||
                          "Finding athlete and movement events…"}
                      </strong>
                      <small>
                        {activeSlotState.progress}% · No physical markers
                        required
                      </small>
                    </div>
                  )}

                  {activeVideoUrl &&
                    activeSlotState.status === "error" && (
                      <div className="analysis-overlay">
                        <strong>
                          Automatic analysis needs a clearer video
                        </strong>
                        <small>{activeSlotState.error}</small>
                      </div>
                    )}
                </div>

                {activeVideoUrl && (
                  <>
                    <div className="transport">
                      <div className="transport-buttons">
                        <button
                          className="play-btn"
                          onClick={togglePlay}
                          aria-label={isPlaying ? "Pause" : "Play"}
                        >
                          <Icon name={isPlaying ? "pause" : "play"} />
                        </button>

                        <button
                          onClick={() => stepVideo(-1)}
                          aria-label="Previous analyzed frame"
                        >
                          <Icon name="prev" />
                        </button>

                        <button
                          onClick={() => stepVideo(1)}
                          aria-label="Next analyzed frame"
                        >
                          <Icon name="next" />
                        </button>
                      </div>

                      <span className="timecode">
                        {formatTime(progress * duration)}{" "}
                        <small>/ {formatTime(duration)}s</small>
                      </span>

                      <input
                        aria-label="Video progress"
                        type="range"
                        min="0"
                        max="1000"
                        value={Math.round(progress * 1000)}
                        onChange={(event) =>
                          seek(Number(event.target.value) / 1000)
                        }
                      />

                      <span className="fps">
                        {activePoseClip ? "ANALYZED FRAMES" : "VIDEO"}
                      </span>
                    </div>

                    <div className="view-switcher">
                      <span>View</span>

                      {(
                        ["video", "skeleton", "3d"] as OverlayMode[]
                      ).map((mode) => (
                        <button
                          key={mode}
                          className={overlayMode === mode ? "active" : ""}
                          onClick={() => setOverlayMode(mode)}
                        >
                          {mode === "video"
                            ? "Video + overlay"
                            : mode === "skeleton"
                              ? "Skeleton only"
                              : "Estimated 3D"}
                        </button>
                      ))}

                      <span className="estimate-note">
                        <Icon name="info" /> 3D is an estimate, not a lab
                        measurement
                      </span>
                    </div>

                    {activeSlotState.status === "ready" &&
                      markers.length > 0 &&
                      selectedMarker && (
                        <div className="event-editor">
                          <div className="event-editor-head">
                            <div>
                              <p className="eyebrow">
                                Automatic event detection
                              </p>
                              <h3>{activeMovement.editorTitle}</h3>
                            </div>

                            <div className="legend">
                              {activeMovementId === "repeat-jumps" && (
                                <>
                                  <span>
                                    <i className="mint" /> Takeoff
                                  </span>
                                  <span>
                                    <i className="orange" /> Landing
                                  </span>
                                </>
                              )}

                              {activeMovementId === "single-leg-drop" && (
                                <>
                                  <span>
                                    <i className="mint" /> Contact
                                  </span>
                                  <span>
                                    <i className="orange" /> Deepest
                                  </span>
                                </>
                              )}

                              {activeMovementId !== "repeat-jumps" &&
                                activeMovementId !==
                                  "single-leg-drop" && (
                                  <span>
                                    <i className="orange" /> Suggested frame
                                  </span>
                                )}
                            </div>
                          </div>

                          <div
                            className="event-timeline"
                            ref={timelineRef}
                          >
                            <div className="event-rail">
                              {Array.from(
                                {
                                  length:
                                    activeMovementId === "repeat-jumps"
                                      ? 5
                                      : 3,
                                },
                                (_, index) => (
                                  <span
                                    key={index}
                                    className="rep-zone"
                                    style={{
                                      left: `${
                                        index *
                                        (100 /
                                          (activeMovementId ===
                                          "repeat-jumps"
                                            ? 5
                                            : 3))
                                      }%`,
                                      width: `${
                                        100 /
                                        (activeMovementId === "repeat-jumps"
                                          ? 5
                                          : 3)
                                      }%`,
                                    }}
                                  >
                                    REP {index + 1}
                                  </span>
                                ),
                              )}
                            </div>

                            <span
                              className="playhead"
                              style={{ left: `${progress * 100}%` }}
                            />

                            {markers.map((marker) => (
                              <button
                                key={marker.id}
                                className={`event-marker ${marker.color} ${
                                  selectedMarkerId === marker.id
                                    ? "selected"
                                    : ""
                                }`}
                                style={{
                                  left: `${
                                    duration > 0
                                      ? (marker.timeSec / duration) * 100
                                      : 0
                                  }%`,
                                }}
                                onPointerDown={(event) =>
                                  beginDrag(event, marker.id)
                                }
                                onClick={() => {
                                  setSelectedMarkerId(marker.id);
                                  if (duration > 0) {
                                    seek(marker.timeSec / duration);
                                  }
                                }}
                                aria-label={`${marker.label} at ${formatTime(
                                  marker.timeSec,
                                )} seconds`}
                              >
                                <span>{marker.label}</span>
                                <i />
                              </button>
                            ))}
                          </div>

                          <div className="marker-inspector">
                            <div className="selected-event">
                              <span
                                className={`event-swatch ${selectedMarker.color}`}
                              />
                              <span>
                                <small>Selected event</small>
                                <strong>
                                  {selectedMarker.label} · Rep{" "}
                                  {selectedMarker.rep}
                                </strong>
                              </span>
                            </div>

                            <div className="frame-nudger">
                              <button onClick={() => nudge(-1)}>
                                − 1 frame
                              </button>
                              <span>
                                <small>Event time</small>
                                <strong>
                                  {formatTime(selectedMarker.timeSec)}s
                                </strong>
                              </span>
                              <button onClick={() => nudge(1)}>
                                + 1 frame
                              </button>
                            </div>

                            <button
                              className="reset-btn"
                              onClick={resetSelected}
                            >
                              <Icon name="refresh" /> Reset to auto
                            </button>

                            <div className="confidence">
                              <span>
                                <small>Detection confidence</small>
                                <strong>
                                  {selectedMarker.confidence}%
                                </strong>
                              </span>
                              <i>
                                <b
                                  style={{
                                    width: `${selectedMarker.confidence}%`,
                                  }}
                                />
                              </i>
                            </div>
                          </div>
                        </div>
                      )}
                  </>
                )}
              </section>

              {activeResult ? (
                <aside className="analysis-panel">
                  <div className="panel-section summary-panel">
                    <p className="eyebrow">
                      {activeMovement.pillar} ·{" "}
                      {activeSlotDefinition.shortLabel}
                    </p>

                    <div className="score-row">
                      <strong>
                        {activeResult.scorable
                          ? activeResult.score
                          : "—"}
                      </strong>
                      <span>/100</span>
                      <span className="score-status">
                        {activeResult.status}
                      </span>
                    </div>

                    <p className="plain-language">
                      {activeResult.summary}
                    </p>
                  </div>

                  <div className="panel-section live-metrics">
                    <div className="section-title">
                      <h3>Live measurements</h3>
                      <span>updates as you edit</span>
                    </div>

                    <div className="metric-grid">
                      {activeResult.measurements.map((measurement) => (
                        <div key={measurement.label}>
                          <small>{measurement.label}</small>
                          <strong>
                            {formatMeasurement(
                              measurement.value,
                              measurement.digits,
                            )}
                            <em>{measurement.unit}</em>
                          </strong>
                        </div>
                      ))}
                    </div>

                    <div className="measurement-note">
                      <Icon name="info" />
                      <span>
                        {activeResult.measurementNote}
                        {` ${activeMovement.benchmark}`}
                        {activeResult.warnings[0]
                          ? ` ${activeResult.warnings[0]}`
                          : ""}
                      </span>
                    </div>
                  </div>

                  {activeResult.reps.length > 0 && (
                    <div className="panel-section rep-table-section">
                      <div className="section-title">
                        <h3>
                          {activeMovementId === "repeat-jumps"
                            ? "Jump-by-jump"
                            : "Rep-by-rep"}
                        </h3>

                        <span>
                          {
                            activeResult.reps.filter(
                              (rep) =>
                                rep.valid &&
                                !activeSlotState.excludedReps.includes(
                                  rep.rep,
                                ),
                            ).length
                          }
                          /{activeResult.reps.length} valid
                        </span>
                      </div>

                      <div className="rep-table">
                        <div className="rep-row head">
                          <span>Rep</span>
                          <span>
                            {activeMovementId === "repeat-jumps"
                              ? "Air"
                              : "Measure"}
                          </span>
                          <span>
                            {activeMovementId === "repeat-jumps"
                              ? "Floor"
                              : activeMovementId === "overhead-squat"
                                ? "Trunk"
                                : "Second"}
                          </span>
                          <span />
                        </div>

                        {activeResult.reps.map((rep) => {
                          const invalid =
                            !rep.valid ||
                            activeSlotState.excludedReps.includes(rep.rep);

                          return (
                            <div
                              className={
                                invalid
                                  ? "rep-row invalid"
                                  : "rep-row"
                              }
                              key={rep.rep}
                            >
                              <span>
                                <b>{rep.rep}</b>
                              </span>
                              <span>
                                {formatRepValue(
                                  rep.primary,
                                  rep.primaryUnit,
                                )}
                              </span>
                              <span>
                                {formatRepValue(
                                  rep.secondary,
                                  rep.secondaryUnit,
                                )}
                              </span>

                              {activeMovementId === "repeat-jumps" ? (
                                <button
                                  onClick={() => toggleRep(rep.rep)}
                                  title={
                                    activeSlotState.excludedReps.includes(
                                      rep.rep,
                                    )
                                      ? "Include rep"
                                      : "Exclude rep"
                                  }
                                >
                                  {activeSlotState.excludedReps.includes(
                                    rep.rep,
                                  )
                                    ? "↩"
                                    : "×"}
                                </button>
                              ) : (
                                <span />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="panel-section finding">
                    <span className="finding-icon">!</span>
                    <div>
                      <small>Primary finding</small>
                      <strong>{activeResult.findingTitle}</strong>
                      <p>{activeResult.findingText}</p>
                    </div>
                  </div>

                  <div className="approval-panel">
                    <div>
                      <small>Analysis status</small>
                      <strong>
                        {verified
                          ? "Coach verified"
                          : activeResult.scorable
                            ? confidenceLabel(activeResult.confidence)
                            : "Marker review required"}
                      </strong>
                    </div>

                    <button
                      className={
                        verified
                          ? "approve-btn verified"
                          : "approve-btn"
                      }
                      onClick={approve}
                      disabled={!activeResult.scorable}
                    >
                      <Icon name="check" />{" "}
                      {verified
                        ? "Approved"
                        : activeResult.scorable
                          ? "Approve analysis"
                          : "Check markers"}
                    </button>
                  </div>
                </aside>
              ) : (
                <aside className="analysis-panel empty-analysis">
                  <div className="empty-analysis-copy">
                    <span className="empty-analysis-icon">—</span>

                    <p className="eyebrow">
                      {isActiveAnalyzing
                        ? "Automatic analysis"
                        : activeSlotState.status === "error"
                          ? "Video review"
                          : "Waiting for a video"}
                    </p>

                    <h3>
                      {isActiveAnalyzing
                        ? "Analyzing the movement…"
                        : activeSlotState.status === "error"
                          ? "No reliable result yet"
                          : "No results yet"}
                    </h3>

                    <p>
                      {isActiveAnalyzing
                        ? activeSlotState.progressMessage
                        : activeSlotState.status === "error"
                          ? activeSlotState.error
                          : "Scores, measurements, and findings will appear after a real athlete video is added and analyzed."}
                    </p>
                  </div>

                  <div className="empty-analysis-steps">
                    <span>
                      <b>1</b> Add the video {activeAthlete.name} sent you
                    </span>
                    <span>
                      <b>2</b> Software finds the keyframes
                    </span>
                    <span>
                      <b>3</b> You check and approve them
                    </span>
                  </div>

                  <button
                    className="empty-side-button"
                    onClick={() => uploadRef.current?.click()}
                  >
                    <Icon name="upload" />{" "}
                    {activeVideoUrl
                      ? "Replace this video"
                      : `Add ${activeSlotDefinition.shortLabel.toLowerCase()} video`}
                  </button>
                </aside>
              )}
            </div>
          </div>
        )}

        {view === "intake" && activeAthlete && (
          <div className="intake-page">
            <section className="intake-hero">
              <div>
                <span className="step-pill">
                  Coach workspace · {activeAthlete.name}
                </span>
                <h2>
                  Add the videos {activeAthlete.name} sent you.
                </h2>
                <p>
                  Save the clips from text, email, or your file-sharing app.
                  Then place each file beside the matching movement below.
                </p>
              </div>

              <div className="intake-guide">
                <span>
                  <b>1</b>
                  <small>Save the clips to this device</small>
                </span>
                <i>→</i>
                <span>
                  <b>2</b>
                  <small>Add each clip below</small>
                </span>
                <i>→</i>
                <span>
                  <b>3</b>
                  <small>Review the automatic analysis</small>
                </span>
              </div>
            </section>

            <section className="intake-heading">
              <div>
                <p className="eyebrow">Assessment videos</p>
                <h2>Five movements</h2>
              </div>

              <p>
                You do not need to rename the files. Just match each clip to
                the right movement.
              </p>
            </section>

            <section className="intake-list">
              {movements.map((movement) => {
                const slotStates = movement.slots.map((slot) => ({
                  definition: slot,
                  state:
                    athleteAssessment[movement.id]?.[slot.id] ??
                    emptySlotState,
                }));

                const uploaded = slotStates.every(({ state }) =>
                  Boolean(state.url),
                );

                const requirement = videoRequirements[movement.id];

                return (
                  <article
                    className={
                      uploaded ? "intake-card uploaded" : "intake-card"
                    }
                    key={movement.id}
                  >
                    <span className="intake-number">
                      {movement.number}
                    </span>

                    <div className="intake-name">
                      <p className="eyebrow">{movement.pillar}</p>
                      <h3>{movement.name}</h3>
                      <p>{movement.purpose}</p>
                    </div>

                    <div className="file-requirements">
                      <span>
                        <small>Camera</small>
                        <strong>{requirement.angle}</strong>
                      </span>
                      <span>
                        <small>Needed</small>
                        <strong>{requirement.files}</strong>
                      </span>
                      <span>
                        <small>Quick check</small>
                        <strong>{requirement.check}</strong>
                      </span>
                    </div>

                    <div
                      className={
                        movement.slots.length > 1
                          ? "coach-upload-slots two"
                          : "coach-upload-slots"
                      }
                    >
                      {slotStates.map(({ definition, state }) => {
                        const hasFile = Boolean(state.url);

                        return (
                          <label
                            className={
                              hasFile
                                ? "coach-upload-box has-file"
                                : "coach-upload-box"
                            }
                            key={definition.id}
                          >
                            <input
                              type="file"
                              accept="video/*"
                              onChange={(event) =>
                                handleVideoUpload(
                                  event,
                                  movement.id,
                                  definition.id,
                                  false,
                                )
                              }
                            />

                            <span className="coach-upload-icon">
                              <Icon
                                name={hasFile ? "check" : "upload"}
                              />
                            </span>

                            <span className="coach-upload-copy">
                              <strong>
                                {state.status === "processing"
                                  ? `${definition.shortLabel}: ${state.progress}%`
                                  : state.status === "error"
                                    ? `${definition.shortLabel}: try another video`
                                    : hasFile
                                      ? `${definition.shortLabel} video added`
                                      : `Add ${definition.shortLabel.toLowerCase()} video`}
                              </strong>

                              <small>
                                {hasFile
                                  ? state.fileName
                                  : definition.camera}
                              </small>
                            </span>

                            <span className="upload-action">
                              {hasFile ? "Replace" : "Choose file"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </section>

            <div className="intake-progress">
              <span>
                <strong>
                  {uploadedMovementCount} of 5 movements complete
                </strong>
                <small>
                  {uploadedMovementCount === 0
                    ? "Start with any movement."
                    : `The files are organized under ${activeAthlete.name}’s ${activeAthlete.assessmentType.toLowerCase()}.`}
                </small>
              </span>

              <i>
                <b
                  style={{
                    width: `${
                      (uploadedMovementCount / movements.length) * 100
                    }%`,
                  }}
                />
              </i>

              <button
                disabled={uploadedMovementCount === 0}
                onClick={() => {
                  const firstUploaded = movements.find((movement) =>
                    movement.slots.some((slot) =>
                      Boolean(
                        athleteAssessment[movement.id]?.[slot.id]?.url,
                      ),
                    ),
                  );

                  if (firstUploaded) {
                    setActiveMovementId(firstUploaded.id);

                    const firstSlotWithVideo =
                      firstUploaded.slots.find((slot) =>
                        Boolean(
                          athleteAssessment[firstUploaded.id]?.[slot.id]
                            ?.url,
                        ),
                      ) ?? firstUploaded.slots[0];

                    setActiveSlotId(firstSlotWithVideo.id);
                  }

                  setView("review");
                }}
              >
                Review videos <span>→</span>
              </button>
            </div>
          </div>
        )}

        {view === "report" &&
          activeAthlete &&
          (reportReady ? (
            <div className="report-page">
              <section className="report-header">
                <div>
                  <p className="eyebrow">
                    {activeAthlete.assessmentType} movement screen ·{" "}
                    {new Date(
                      activeAthlete.createdAt,
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>

                  <h2>
                    {activeAthlete.name}&apos;s hitter movement profile
                  </h2>

                  <p>
                    Five simple tests show how {activeAthlete.name} creates,
                    controls, and transfers movement for the swing.
                  </p>
                </div>

                <div className="report-actions">
                  <span className="pill green">
                    <Icon name="check" /> Coach verified
                  </span>
                  <button onClick={() => window.print()}>
                    Print report
                  </button>
                </div>
              </section>

              <section className="report-overview">
                <div className="overall-score-card">
                  <div
                    className="score-ring"
                    style={
                      {
                        "--score": `${overallScore}%`,
                      } as React.CSSProperties
                    }
                  >
                    <span>
                      <strong>{overallScore}</strong>
                      <small>/100</small>
                    </span>
                  </div>

                  <div>
                    <p className="eyebrow">
                      SwingLab Movement Score
                    </p>

                    <h3>
                      {overallScore >= 80
                        ? "Strong starting point"
                        : overallScore >= 60
                          ? "Developing movement profile"
                          : "Clear training priorities"}
                    </h3>

                    <p>
                      Each of the five movement pillars contributes 20%. A
                      low side still creates a flag even when the left-right
                      average is higher.
                    </p>
                  </div>
                </div>

                <div className="radar-card">
                  <RadarChart
                    scores={movementSummaries.map(
                      (summary) => summary.score,
                    )}
                  />

                  <div className="radar-label top">
                    <span>Ankle</span>
                    <b>{movementSummaries[0].score}</b>
                  </div>

                  <div className="radar-label right-top">
                    <span>Movement</span>
                    <b>{movementSummaries[1].score}</b>
                  </div>

                  <div className="radar-label right-bottom">
                    <span>Landing</span>
                    <b>{movementSummaries[2].score}</b>
                  </div>

                  <div className="radar-label left-bottom">
                    <span>Reactive</span>
                    <b>{movementSummaries[3].score}</b>
                  </div>

                  <div className="radar-label left-top">
                    <span>Hip Mobility</span>
                    <b>{movementSummaries[4].score}</b>
                  </div>
                </div>
              </section>

              <section className="plain-summary">
                <div className="summary-kicker">
                  What this means for hitting
                </div>

                <h3>
                  {activeAthlete.name}:{" "}
                  {hittingMeaningByMovement[
                    prioritySummary.movement.id
                  ]}
                </h3>

                <p>
                  The goal is not a “perfect” movement score. The goal is to
                  remove physical limits that make a repeatable swing harder.
                </p>
              </section>

              <section className="pillar-grid">
                {movementSummaries.map((summary, index) => {
                  const movement = summary.movement;

                  const bilateralDetail =
                    summary.leftResult &&
                    summary.rightResult &&
                    summary.sideGap !== null
                      ? ` Left ${formatMeasurement(
                          summary.leftResult.rawValue,
                          1,
                        )}${summary.leftResult.rawUnit} · Right ${formatMeasurement(
                          summary.rightResult.rawValue,
                          1,
                        )}${summary.rightResult.rawUnit} · Gap ${formatMeasurement(
                          summary.sideGap,
                          1,
                        )}${summary.leftResult.rawUnit}.`
                      : "";

                  return (
                    <article
                      className="pillar-card"
                      key={movement.id}
                    >
                      <div className="pillar-top">
                        <span className="pillar-index">
                          {movement.number}
                        </span>

                        <span
                          className={`pillar-status status-${index}`}
                        >
                          {summary.deficiency
                            ? "Priority flag"
                            : summary.status}
                        </span>
                      </div>

                      <h3>{movement.pillar}</h3>

                      <div className="pillar-score">
                        <strong>{summary.score}</strong>
                        <span>/100</span>
                        <i>
                          <b
                            style={{ width: `${summary.score}%` }}
                          />
                        </i>
                      </div>

                      <p>
                        {summary.result?.findingText}
                        {bilateralDetail}
                      </p>

                      <small>
                        Measured with: {movement.name} · Starting coaching
                        benchmark
                      </small>
                    </article>
                  );
                })}
              </section>

              <section className="action-section">
                <div className="action-head">
                  <div>
                    <p className="eyebrow">
                      First training block · 4 weeks
                    </p>
                    <h2>What we do next</h2>
                  </div>

                  <p>
                    Three exercises. Ten focused minutes. Reassess the same
                    five movements after the block.
                  </p>
                </div>

                <div className="exercise-grid">
                  {trainingPlan.map((exercise) => (
                    <article
                      className="exercise-card"
                      key={exercise.number}
                    >
                      <span>{exercise.number}</span>

                      <div className="exercise-visual">
                        <PoseCanvas
                          mode="skeleton"
                          progress={Number(exercise.number) * 0.19}
                          movement="repeat-jumps"
                          dimmed
                        />
                      </div>

                      <h3>{exercise.name}</h3>
                      <strong>{exercise.dose}</strong>
                      <p>{exercise.focus}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="reassessment-callout">
                <span className="calendar-block">
                  <b>21</b>
                  <small>AUG</small>
                </span>

                <div>
                  <p className="eyebrow">Next reassessment</p>
                  <h3>Repeat the same screen in 4 weeks.</h3>
                  <p>
                    We will compare the videos, scores, and jump timing
                    against {activeAthlete.name}&apos;s own baseline—not a
                    professional athlete.
                  </p>
                </div>

                <button onClick={() => setView("intake")}>
                  Start reassessment →
                </button>
              </section>

              <section className="method-note">
                <strong>How to read this report</strong>
                <p>
                  Scores summarize markerless 2D movement observations and
                  video timing. Jump height is estimated from time in the air.
                  The 3D view is a visual estimate. SwingLab Movement does not
                  measure actual ground-reaction force, diagnose injury, or
                  replace a force plate.
                </p>
              </section>
            </div>
          ) : (
            <div className="report-page empty-report-page">
              <section className="empty-report-card">
                <span className="empty-report-icon">◫</span>
                <p className="eyebrow">Report not ready</p>
                <h2>There is no movement report yet.</h2>

                <p>
                  SwingLab Movement creates a report only after every
                  required clip is analyzed and approved across all five
                  movements.
                </p>

                <div className="report-readiness">
                  <span>
                    <small>Videos added</small>
                    <strong>{uploadedMovementCount} / 5</strong>
                    <i>
                      <b
                        style={{
                          width: `${
                            (uploadedMovementCount /
                              movements.length) *
                            100
                          }%`,
                        }}
                      />
                    </i>
                  </span>

                  <span>
                    <small>Coach approved</small>
                    <strong>{verifiedMovementCount} / 5</strong>
                    <i>
                      <b
                        style={{
                          width: `${
                            (verifiedMovementCount /
                              movements.length) *
                            100
                          }%`,
                        }}
                      />
                    </i>
                  </span>
                </div>

                <button
                  onClick={() =>
                    setView(
                      uploadedMovementCount === 0
                        ? "intake"
                        : "review",
                    )
                  }
                >
                  {uploadedMovementCount === 0
                    ? "Add athlete videos"
                    : "Continue reviewing"}{" "}
                  →
                </button>
              </section>
            </div>
          ))}
      </section>

      {toast && (
        <div className="toast">
          <Icon name="check" /> {toast}
        </div>
      )}
    </main>
  );
}
