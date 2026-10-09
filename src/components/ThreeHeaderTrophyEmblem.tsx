import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface ThreeHeaderTrophyEmblemProps {
  mode?: 'games' | 'tournaments' | 'arena' | 'leaderboard';
  size?: number;
  onClick?: () => void;
}

export default function ThreeHeaderTrophyEmblem({
  mode = 'games',
  size = 54,
  onClick
}: ThreeHeaderTrophyEmblemProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef(mode);
  const spinBoostRef = useRef(0);

  useEffect(() => {
    modeRef.current = mode;
    spinBoostRef.current = 0.22;
  }, [mode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animId = 0;
    let renderer: THREE.WebGLRenderer | null = null;

    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
      camera.position.set(0, 0.35, 5.2);
      camera.lookAt(0, 0.1, 0);

      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(size, size);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      // إضاءة الاستوديو ثلاثية النقاط (Three-Point Studio Lighting)
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xfff3c4, 3.2);
      keyLight.position.set(4, 6, 5);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.6);
      fillLight.position.set(-5, 2, 3);
      scene.add(fillLight);

      const rimLight = new THREE.PointLight(0xff1744, 4.5, 14);
      rimLight.position.set(0, -2.5, -3);
      scene.add(rimLight);

      // المجموعة الرئيسية للكأس وشعار الحلبة ثلاثي الأبعاد (Low-Poly 3D Trophy & Arena Crest)
      const emblemGroup = new THREE.Group();
      scene.add(emblemGroup);

      // خامات معدنية منخفضة المضلعات (Low-Poly Flat-Shaded PBR Materials)
      const goldMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#fbbf24'),
        emissive: new THREE.Color('#78350f'),
        emissiveIntensity: 0.35,
        metalness: 0.88,
        roughness: 0.22,
        flatShading: true
      });

      const darkBaseMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#1e1b2e'),
        metalness: 0.7,
        roughness: 0.35,
        flatShading: true
      });

      const coreCrystalMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#FF1744'),
        emissive: new THREE.Color('#FF1744'),
        emissiveIntensity: 0.75,
        metalness: 0.4,
        roughness: 0.15,
        flatShading: true
      });

      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#FF1744'),
        transparent: true,
        opacity: 0.75
      });

      // 1. قاعدة الكأس السداسية المدرجة (Low-Poly Pedestal)
      const baseGeo1 = new THREE.CylinderGeometry(0.82, 1.02, 0.28, 6);
      const baseMesh1 = new THREE.Mesh(baseGeo1, darkBaseMat);
      baseMesh1.position.y = -1.25;
      emblemGroup.add(baseMesh1);

      const baseGeo2 = new THREE.CylinderGeometry(0.62, 0.78, 0.22, 6);
      const baseMesh2 = new THREE.Mesh(baseGeo2, goldMat);
      baseMesh2.position.y = -1.0;
      emblemGroup.add(baseMesh2);

      // 2. عمود الكأس المضلع (Faceted Stem)
      const stemGeo = new THREE.CylinderGeometry(0.22, 0.38, 0.65, 6);
      const stemMesh = new THREE.Mesh(stemGeo, goldMat);
      stemMesh.position.y = -0.58;
      emblemGroup.add(stemMesh);

      // 3. قدح الكأس الملكي منخفض المضلعات (Low-Poly Faceted Chalice Bowl)
      const cupGeo = new THREE.CylinderGeometry(0.98, 0.34, 1.05, 7, 1);
      const cupMesh = new THREE.Mesh(cupGeo, goldMat);
      cupMesh.position.y = 0.22;
      emblemGroup.add(cupMesh);

      // طوق التاج العلوي للكأس
      const crownRimGeo = new THREE.TorusGeometry(0.96, 0.08, 6, 7);
      const crownRimMesh = new THREE.Mesh(crownRimGeo, goldMat);
      crownRimMesh.rotation.x = Math.PI / 2;
      crownRimMesh.position.y = 0.74;
      emblemGroup.add(crownRimMesh);

      // 4. أجنحة/مقابض الكأس الهندسية على الجانبين (Low-Poly Wing Handles)
      const handleGeo = new THREE.TorusGeometry(0.42, 0.075, 5, 6, Math.PI * 1.15);
      const leftHandle = new THREE.Mesh(handleGeo, goldMat);
      leftHandle.position.set(-0.78, 0.26, 0);
      leftHandle.rotation.z = Math.PI * 0.45;
      emblemGroup.add(leftHandle);

      const rightHandle = new THREE.Mesh(handleGeo, goldMat);
      rightHandle.position.set(0.78, 0.26, 0);
      rightHandle.rotation.z = -Math.PI * 0.45;
      rightHandle.rotation.y = Math.PI;
      emblemGroup.add(rightHandle);

      // 5. جوهرة الطاقة العائمة فوق الكأس (Floating Low-Poly Energy Core)
      const crystalGeo = new THREE.OctahedronGeometry(0.44, 0);
      const crystalMesh = new THREE.Mesh(crystalGeo, coreCrystalMat);
      crystalMesh.position.y = 1.18;
      emblemGroup.add(crystalMesh);

      // 6. مدار الحلبة المضيء حول الكأس (Orbital Arena Emblem Ring)
      const orbitRingGeo = new THREE.TorusGeometry(1.55, 0.04, 8, 32);
      const orbitRingMesh = new THREE.Mesh(orbitRingGeo, ringMat);
      orbitRingMesh.rotation.x = Math.PI * 0.36;
      emblemGroup.add(orbitRingMesh);

      let tick = 0;

      const animate = () => {
        tick += 0.025;

        // تخصيص لون الجوهرة والمدار حسب التبويب النشط
        const activeColor =
          modeRef.current === 'tournaments'
            ? '#f59e0b'
            : modeRef.current === 'arena'
            ? '#38bdf8'
            : modeRef.current === 'leaderboard'
            ? '#a855f7'
            : '#FF1744';

        coreCrystalMat.color.set(activeColor);
        coreCrystalMat.emissive.set(activeColor);
        ringMat.color.set(activeColor);
        rimLight.color.set(activeColor);

        // دوران الكأس مع تسارع تفاعلي عند النقر أو تبديل التبويبات
        const baseSpin = 0.018 + spinBoostRef.current;
        spinBoostRef.current *= 0.92;

        emblemGroup.rotation.y += baseSpin;
        emblemGroup.position.y = Math.sin(tick * 1.5) * 0.09;

        // دوران عكسي سريع لجوهرة الطاقة العلوية ومدار الحلبة
        crystalMesh.rotation.y -= 0.045;
        crystalMesh.rotation.x = Math.sin(tick * 2) * 0.25;
        crystalMesh.position.y = 1.18 + Math.sin(tick * 3) * 0.08;

        orbitRingMesh.rotation.z -= 0.03;
        orbitRingMesh.rotation.y = Math.cos(tick) * 0.35;

        renderer?.render(scene, camera);
        animId = requestAnimationFrame(animate);
      };

      animId = requestAnimationFrame(animate);

      return () => {
        cancelAnimationFrame(animId);
        baseGeo1.dispose();
        baseGeo2.dispose();
        stemGeo.dispose();
        cupGeo.dispose();
        crownRimGeo.dispose();
        handleGeo.dispose();
        crystalGeo.dispose();
        orbitRingGeo.dispose();
        goldMat.dispose();
        darkBaseMat.dispose();
        coreCrystalMat.dispose();
        ringMat.dispose();
        renderer?.dispose();
      };
    } catch {
      return () => {
        if (animId) cancelAnimationFrame(animId);
      };
    }
  }, [size]);

  return (
    <button
      type="button"
      onClick={() => {
        spinBoostRef.current = 0.32;
        onClick?.();
      }}
      title="شعار وكأس حلبة الأوتاكو ثلاثي الأبعاد"
      className="relative group flex items-center justify-center rounded-2xl bg-gradient-to-b from-amber-500/15 via-[#141422] to-[#0a0a12] border border-amber-400/35 hover:border-[#FF1744] shadow-[0_0_25px_rgba(245,158,11,0.2)] transition cursor-pointer shrink-0 overflow-hidden"
      style={{ width: size, height: size }}
    >
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center pointer-events-none"
      />
    </button>
  );
}
