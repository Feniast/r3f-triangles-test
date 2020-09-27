import React, {
  useRef,
  Suspense,
  useMemo,
  useLayoutEffect,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  Canvas,
  useFrame,
  ReactThreeFiber,
  extend,
  useThree,
  useUpdate,
} from "react-three-fiber";
import * as THREE from "three";
import { OrbitControls, shaderMaterial, useTextureLoader, Html } from "drei";
import * as dat from "dat.gui";
import { useDeepMemo, useDeepCompareEffect } from "./useDeep";
import myVideo from "url:./assets/video.mp4";
import vertex from "./shader/vertex.glsl";
import fragment from "./shader/fragment.glsl";
import vertexParticles from "./shader/vertex-particles.glsl";
import fragmentParticles from "./shader/fragment-particles.glsl";
import { PlaneBufferGeometry } from "three";
import tri from "url:./assets/tri.png";
import mask1Image from "url:./assets/mask1.jpg";
import useSWR from "swr";

interface DatGuiSetting {
  value: string | number | undefined;
  type?: "color" | undefined;
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
  const obj = useDeepMemo<Record<keyof T, DatGuiSetting["value"]>>(() => {
    const o = {} as Record<keyof T, DatGuiSetting["value"]>;
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
      if (type === "color") {
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

interface UseImageDataOptions {
  scale?: number;
  image: string | HTMLImageElement;
}

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.addEventListener("load", () => {
      resolve(i);
    });
    i.addEventListener("error", (e) => {
      reject(e);
    });
    i.src = src;
  });
};

const useImageData = (options: UseImageDataOptions) => {
  const canvas = useMemo(() => document.createElement("canvas"), []);
  const ctx = useMemo(() => canvas.getContext("2d"), [canvas]);
  const { image, scale = 1 } = options;
  const { data: img } = useSWR<HTMLImageElement>(
    ["image", image],
    (__, i) => {
      if (typeof i === "string") {
        return loadImage(i);
      }
      return i;
    },
    {
      suspense: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: false,
    }
  );

  const imgData = useMemo(() => {
    if (!img) return null;
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, [scale]);

  return {
    image: img,
    data: imgData,
  };
};

const size = 100;

const Points = () => {
  const { clock } = useThree();
  const { data: maskData } = useImageData({
    image: mask1Image,
    scale: 150 / 1920,
  });
  const triTexture = useTextureLoader(tri);
  const geometry = useMemo(() => {
    const bufferGeo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const alphas: number[] = [];
    const { width, height, data } = maskData;
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        const p = data[(j * width + i) * 4];
        if (p > 0) {
          const x = (i - width * 0.5) / 150;
          const y = -(j - height * 0.5) / 150;
          vertices.push(x, y, 0);
          alphas.push(Math.random() * 0.6 + 0.4);
        }
      }
    }
    bufferGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    bufferGeo.setAttribute(
      "alpha",
      new THREE.Float32BufferAttribute(alphas, 1)
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
      <Suspense
        fallback={
          <Html>
            <div>Loading</div>
          </Html>
        }
      >
        <Scene />
      </Suspense>
    </Canvas>
  );
};

export default App;
