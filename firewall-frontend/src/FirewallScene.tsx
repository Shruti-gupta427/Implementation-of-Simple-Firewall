import { useMemo, useRef, useState } from "react";
import { OrbitControls, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type PacketSpawn = {
  id: number;
  blocked: boolean;
  server: "WEB" | "EMAIL" | "DNS";
};

type FirewallSceneProps = {
  packets: PacketSpawn[];
  onPacketDone: (id: number) => void;
};

const cloudPosition = new THREE.Vector3(-7, 0, 0);
const firewallPosition = new THREE.Vector3(0, 0, 0);
const serverPositionMap: Record<PacketSpawn["server"], THREE.Vector3> = {
  WEB: new THREE.Vector3(7, 2.4, 0),
  EMAIL: new THREE.Vector3(7, 0, 0),
  DNS: new THREE.Vector3(7, -2.4, 0),
};

type LabeledBoxProps = {
  position: [number, number, number];
  label: string;
  color: string;
};

function LabeledBox({ position, label, color }: LabeledBoxProps) {
  return (
    <group>
      <mesh position={position}>
        <boxGeometry args={[1.8, 1.5, 1.8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <Text position={[position[0], position[1] + 1.4, position[2]]} fontSize={0.45} color="#d1d5db">
        {label}
      </Text>
    </group>
  );
}

function PacketActor({ packet, onDone }: { packet: PacketSpawn; onDone: (id: number) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const [stage, setStage] = useState<"toFirewall" | "blocked" | "toServer">("toFirewall");
  const [blockedElapsed, setBlockedElapsed] = useState(0);
  const [progress, setProgress] = useState(0);

  const serverTarget = useMemo(() => serverPositionMap[packet.server].clone(), [packet.server]);
  const tempVec = useMemo(() => new THREE.Vector3(), []);
  const shakeBase = useMemo(() => firewallPosition.clone(), []);

  useFrame((_, delta) => {
    if (!ref.current) return;

    const speed = 1.15;

    if (stage === "toFirewall") {
      const next = Math.min(1, progress + delta * speed);
      setProgress(next);
      ref.current.position.lerpVectors(cloudPosition, firewallPosition, next);
      if (next >= 1) {
        if (packet.blocked) {
          setStage("blocked");
        } else {
          setStage("toServer");
          setProgress(0);
        }
      }
      return;
    }

    if (stage === "blocked") {
      const elapsed = blockedElapsed + delta;
      setBlockedElapsed(elapsed);

      const shakeStrength = 0.16;
      const ox = (Math.random() - 0.5) * shakeStrength;
      const oy = (Math.random() - 0.5) * shakeStrength;
      const oz = (Math.random() - 0.5) * shakeStrength;
      ref.current.position.set(shakeBase.x + ox, shakeBase.y + oy, shakeBase.z + oz);

      if (elapsed > 0.45) {
        onDone(packet.id);
      }
      return;
    }

    const next = Math.min(1, progress + delta * speed);
    setProgress(next);
    tempVec.lerpVectors(firewallPosition, serverTarget, next);
    ref.current.position.copy(tempVec);
    if (next >= 1) {
      onDone(packet.id);
    }
  });

  return (
    <mesh ref={ref} position={cloudPosition.toArray()}>
      <sphereGeometry args={[0.25, 16, 16]} />
      <meshStandardMaterial color={packet.blocked ? (stage === "toFirewall" ? "#f59e0b" : "#ef4444") : "#22c55e"} emissive={packet.blocked ? "#450a0a" : "#052e16"} />
    </mesh>
  );
}

export function FirewallScene({ packets, onPacketDone }: FirewallSceneProps) {
  return (
    <>
      <color attach="background" args={["#030712"]} />
      <fog attach="fog" args={["#030712", 12, 26]} />

      <ambientLight intensity={0.7} />
      <directionalLight intensity={1.2} position={[6, 8, 4]} />
      <pointLight intensity={0.8} position={[-7, 2, 2]} />

      <mesh position={cloudPosition.toArray()}>
        <sphereGeometry args={[1.8, 24, 24]} />
        <meshStandardMaterial color="#60a5fa" wireframe />
      </mesh>
      <Text position={[-7, 2.5, 0]} fontSize={0.5} color="#e5e7eb">
        Internet
      </Text>

      <mesh position={firewallPosition.toArray()}>
        <boxGeometry args={[2.6, 2.8, 2.2]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      <Text position={[0, 2.1, 0]} fontSize={0.5} color="#fff7ed">
        Firewall
      </Text>

      <LabeledBox position={[7, 2.4, 0]} color="#38bdf8" label="Web Server" />
      <LabeledBox position={[7, 0, 0]} color="#a78bfa" label="Email Server" />
      <LabeledBox position={[7, -2.4, 0]} color="#34d399" label="DNS Server" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]}>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial color="#111827" />
      </mesh>

      {packets.map((packet) => (
        <PacketActor key={packet.id} packet={packet} onDone={onPacketDone} />
      ))}

      <OrbitControls enablePan={false} minDistance={10} maxDistance={20} maxPolarAngle={Math.PI / 2.1} />
    </>
  );
}
