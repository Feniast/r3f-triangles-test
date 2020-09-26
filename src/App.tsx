import React, {
  useRef,
  Suspense,
  useMemo,
  useLayoutEffect,
  useState,
} from 'react';
import {
  Canvas,
  useFrame,
  ReactThreeFiber,
  extend,
  useThree,
  useUpdate,
} from 'react-three-fiber';
import * as THREE from 'three';
import { OrbitControls, shaderMaterial, useTextureLoader } from 'drei';
import * as dat from 'dat.gui';
import { useDeepMemo, useDeepCompareEffect } from './useDeep';
import myVideo from 'url:./assets/video.mp4';
import vertex from './shader/vertex.glsl';
import fragment from './shader/fragment.glsl';
import vertexParticles from './shader/vertex-particles.glsl';
import fragmentParticles from './shader/fragment-particles.glsl';
import { PlaneBufferGeometry } from 'three';
import tri from 'url:./assets/tri.png';

interface DatGuiSetting {
  value: string | number | undefined;
  type?: 'color' | undefined;
  min?: number;
  max?: number;
  step?: number;
}

const ParticlesShaderMaterial = shaderMaterial(
  {
    time: 0,
    tex: null,
  },
  vertexParticles,
  fragmentParticles,
  () => null
);

extend({
  ParticlesShaderMaterial,
});

const useDatGui = <T extends Record<string, DatGuiSetting>>(settings: T) => {
  const obj = useDeepMemo<Record<keyof T, DatGuiSetting['value']>>(() => {
    const o = {} as Record<keyof T, DatGuiSetting['value']>;
    Object.keys(settings).forEach((key) => {
      const setting = settings[key];
      const { value } = setting;
      o[key as keyof T] = value;
    });
    return o;
  }, [settings]);

  useDeepCompareEffect(() => {
    const inst = new dat.GUI();
    Object.keys(settings).forEach((key) => {
      const setting = settings[key];
      const { type, min, max, step } = setting;
      if (type === 'color') {
        inst.addColor(obj, key);
      } else {
        inst.add(obj, key, min, max, step);
      }
    });
    return () => {
      inst.destroy();
    };
  }, [obj]);

  return obj;
};

const size = 100;

const Points = () => {
  const { clock } = useThree();
  const triTexture = useTextureLoader(tri);
  const geometry = useMemo(() => {
    const bufferGeo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const x = Math.random() - 0.5;
        const y = -(Math.random() - 0.5);
        vertices.push(x, y, 0);
      }
    }
    bufferGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );

    return bufferGeo;
  }, []);

  const material = useRef<THREE.ShaderMaterial>();

  useFrame(() => {
    material.current.uniforms.time.value = clock.elapsedTime;
  });

  return (
    <points geometry={geometry}>
      {/* @ts-ignore */}
      <particlesShaderMaterial
        ref={material}
        depthWrite={false}
        depthTest={false}
        transparent
        attach="material"
        tex={triTexture}
      />
    </points>
  );
};

const Scene = () => {
  return (
    <>
      <Points />
    </>
  );
};

const CameraSet = () => {
  const { aspect, camera } = useThree();
  useLayoutEffect(() => {
    const dist = camera.position.z;
    const height = 0.8; // make the scene "bigger", so the rotation of scene will not show the blank space
    (camera as THREE.PerspectiveCamera).fov =
      2 * (180 / Math.PI) * Math.atan(height / 2 / dist);
    camera.updateProjectionMatrix();
  }, [aspect]);

  return null;
};

const App = () => {
  return (
    <Canvas
      colorManagement
      camera={{
        position: [0, 0, 2],
        fov: 70,
      }}
      onCreated={(ctx) => {
        ctx.gl.setClearColor(0x000000);
      }}
    >
      <ambientLight intensity={0.5} />
      <CameraSet />
      <OrbitControls />
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
};

export default App;
