import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface ThreeAnimeParallaxSceneProps {
  accentColor: string;
  secondaryColor?: string;
  burstTrigger?: number;
  burstMode?: 'idle' | 'challenge' | 'victory' | 'ultimate';
  intensity?: 'normal' | 'high';
}

export default function ThreeAnimeParallaxScene({
  accentColor = '#FF1744',
  secondaryColor = '#f59e0b',
  burstTrigger = 0,
  burstMode = 'idle',
  intensity = 'normal'
}: ThreeAnimeParallaxSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const burstConfigRef = useRef<{ trigger: number; mode: string }>({
    trigger: burstTrigger,
    mode: burstMode
  });
  const colorsRef = useRef({ accentColor, secondaryColor });

  useEffect(() => {
    colorsRef.current = { accentColor, secondaryColor };
  }, [accentColor, secondaryColor]);

  useEffect(() => {
    burstConfigRef.current = { trigger: burstTrigger, mode: burstMode };
  }, [burstTrigger, burstMode]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let animId = 0;
    let renderer: THREE.WebGLRenderer | null = null;

    try {
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x040409, 0.032);

      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 120);
      camera.position.set(0, 0.5, 14);

      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      // إضاءة ثلاثية النقاط للفضاء ثلاثي الأبعاد
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambientLight);

      const keyLight = new THREE.PointLight(new THREE.Color(accentColor), 4.5, 35);
      keyLight.position.set(6, 6, 8);
      scene.add(keyLight);

      const rimLight = new THREE.PointLight(new THREE.Color(secondaryColor), 3.5, 35);
      rimLight.position.set(-7, -5, 6);
      scene.add(rimLight);

      // 1. حلقات الطاقة الكونية الدوارة (3D Anime Chakra / Portal Rings)
      const ringsGroup = new THREE.Group();
      scene.add(ringsGroup);

      const ringGeo1 = new THREE.TorusGeometry(4.8, 0.035, 16, 100);
      const ringMat1 = new THREE.MeshBasicMaterial({
        color: new THREE.Color(accentColor),
        transparent: true,
        opacity: 0.42
      });
      const ringMesh1 = new THREE.Mesh(ringGeo1, ringMat1);
      ringMesh1.rotation.x = Math.PI * 0.32;
      ringsGroup.add(ringMesh1);

      const ringGeo2 = new THREE.TorusGeometry(6.4, 0.025, 16, 100);
      const ringMat2 = new THREE.MeshBasicMaterial({
        color: new THREE.Color(secondaryColor),
        transparent: true,
        opacity: 0.28
      });
      const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
      ringMesh2.rotation.x = -Math.PI * 0.28;
      ringMesh2.rotation.y = Math.PI * 0.18;
      ringsGroup.add(ringMesh2);

      // 2. بلورات الطاقة العائمة في الفضاء (Floating 3D Anime Shards)
      const shardsGroup = new THREE.Group();
      scene.add(shardsGroup);
      const shardGeo = new THREE.OctahedronGeometry(0.32, 0);
      const shardCount = intensity === 'high' ? 18 : 12;
      const shards: { mesh: THREE.Mesh; speedRot: number; floatOffset: number; baseY: number }[] = [];

      for (let i = 0; i < shardCount; i++) {
        const isPrimary = i % 2 === 0;
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(isPrimary ? accentColor : secondaryColor),
          emissive: new THREE.Color(isPrimary ? accentColor : secondaryColor),
          emissiveIntensity: 0.55,
          roughness: 0.2,
          metalness: 0.8
        });
        const mesh = new THREE.Mesh(shardGeo, mat);
        const angle = (i / shardCount) * Math.PI * 2;
        const radius = 5.5 + (Math.random() - 0.5) * 4.5;
        const baseY = (Math.random() - 0.5) * 7;
        mesh.position.set(
          Math.cos(angle) * radius,
          baseY,
          (Math.random() - 0.5) * 8 - 2
        );
        const scale = 0.5 + Math.random() * 1.1;
        mesh.scale.set(scale, scale * 1.4, scale);
        shardsGroup.add(mesh);
        shards.push({
          mesh,
          speedRot: 0.01 + Math.random() * 0.02,
          floatOffset: Math.random() * Math.PI * 2,
          baseY
        });
      }

      // 3. سحابة جسيمات الفضاء العميقة (3D Starfield & Chakra Dust)
      const particleCount = intensity === 'high' ? 420 : 260;
      const positions = new Float32Array(particleCount * 3);
      const velocities = new Float32Array(particleCount);

      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 32;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 24 - 2;
        velocities[i] = 0.015 + Math.random() * 0.035;
      }

      const particlesGeo = new THREE.BufferGeometry();
      particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const particlesMat = new THREE.PointsMaterial({
        color: new THREE.Color(accentColor),
        size: 0.14,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending
      });

      const starField = new THREE.Points(particlesGeo, particlesMat);
      scene.add(starField);

      // 4. نظام انفجار الجسيمات ثلاثي الأبعاد عند الفوز أو التحدي أو الضربة القاضية (3D Burst Nova)
      const burstCount = 160;
      const burstPositions = new Float32Array(burstCount * 3);
      const burstVectors: { vx: number; vy: number; vz: number }[] = [];

      for (let i = 0; i < burstCount; i++) {
        burstPositions[i * 3] = 0;
        burstPositions[i * 3 + 1] = 0;
        burstPositions[i * 3 + 2] = 2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 0.12 + Math.random() * 0.28;
        burstVectors.push({
          vx: Math.sin(phi) * Math.cos(theta) * speed,
          vy: Math.sin(phi) * Math.sin(theta) * speed,
          vz: Math.cos(phi) * speed
        });
      }

      const burstGeo = new THREE.BufferGeometry();
      burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3));
      const burstMat = new THREE.PointsMaterial({
        color: new THREE.Color('#facc15'),
        size: 0.26,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending
      });
      const burstPoints = new THREE.Points(burstGeo, burstMat);
      scene.add(burstPoints);

      let lastProcessedTrigger = burstConfigRef.current.trigger;
      let burstLife = 0;

      const resetBurstNova = (mode: string) => {
        burstLife = 1.0;
        const posAttr = burstGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < burstCount; i++) {
          posAttr.setXYZ(i, 0, 0, 3);
        }
        posAttr.needsUpdate = true;
        burstMat.color.set(
          mode === 'victory'
            ? '#facc15'
            : mode === 'challenge'
            ? '#FF1744'
            : colorsRef.current.accentColor
        );
        burstMat.opacity = 1;
      };

      // تتبع المؤشر / اللمس لتحريك الكاميرا بنظام Parallax 3D سلس
      let targetX = 0;
      let targetY = 0;
      const onPointerMove = (e: PointerEvent) => {
        const nx = (e.clientX / window.innerWidth) * 2 - 1;
        const ny = -(e.clientY / window.innerHeight) * 2 + 1;
        targetX = nx * 2.4;
        targetY = ny * 1.6;
      };
      window.addEventListener('pointermove', onPointerMove, { passive: true });

      const onResize = () => {
        if (!container || !renderer) return;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      let clockTick = 0;

      const animate = () => {
        clockTick += 0.016;

        // تحديث ألوان الإضاءة والحلقات ديناميكياً عند تغيير المقاتل أو اللعبة
        ringMat1.color.set(colorsRef.current.accentColor);
        ringMat2.color.set(colorsRef.current.secondaryColor);
        particlesMat.color.set(colorsRef.current.accentColor);
        keyLight.color.set(colorsRef.current.accentColor);

        // استجابة الكاميرا لحركة Parallax
        camera.position.x += (targetX - camera.position.x) * 0.05;
        camera.position.y += (targetY - camera.position.y) * 0.05;
        camera.lookAt(0, 0, 0);

        // دوران الحلقات الكونية
        ringMesh1.rotation.z += 0.006;
        ringMesh1.rotation.y = Math.sin(clockTick * 0.5) * 0.25;
        ringMesh2.rotation.z -= 0.004;
        ringMesh2.rotation.x = -Math.PI * 0.28 + Math.cos(clockTick * 0.4) * 0.18;

        // حركة البلورات ثلاثية الأبعاد
        shards.forEach((s) => {
          s.mesh.rotation.x += s.speedRot;
          s.mesh.rotation.y += s.speedRot * 1.3;
          s.mesh.position.y = s.baseY + Math.sin(clockTick * 1.8 + s.floatOffset) * 0.45;
        });

        // صعود جسيمات الطاقة الكونية
        const posAttr = particlesGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < particleCount; i++) {
          let py = posAttr.getY(i) + velocities[i];
          if (py > 11) py = -11;
          posAttr.setY(i, py);
        }
        posAttr.needsUpdate = true;

        // التحقق من إطلاق انفجار الجسيمات عند الفوز أو التحدي
        if (burstConfigRef.current.trigger !== lastProcessedTrigger) {
          lastProcessedTrigger = burstConfigRef.current.trigger;
          resetBurstNova(burstConfigRef.current.mode);
        }

        if (burstLife > 0.01) {
          const bAttr = burstGeo.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < burstCount; i++) {
            bAttr.setXYZ(
              i,
              bAttr.getX(i) + burstVectors[i].vx,
              bAttr.getY(i) + burstVectors[i].vy,
              bAttr.getZ(i) + burstVectors[i].vz
            );
          }
          bAttr.needsUpdate = true;
          burstLife *= 0.94;
          burstMat.opacity = burstLife;
        }

        renderer?.render(scene, camera);
        animId = requestAnimationFrame(animate);
      };

      animId = requestAnimationFrame(animate);

      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('resize', onResize);
        ringGeo1.dispose();
        ringMat1.dispose();
        ringGeo2.dispose();
        ringMat2.dispose();
        shardGeo.dispose();
        particlesGeo.dispose();
        particlesMat.dispose();
        burstGeo.dispose();
        burstMat.dispose();
        renderer?.dispose();
      };
    } catch {
      return () => {
        if (animId) cancelAnimationFrame(animId);
      };
    }
  }, [intensity]);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-[2] overflow-hidden"
      aria-hidden="true"
    />
  );
}
