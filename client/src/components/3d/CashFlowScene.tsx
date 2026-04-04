/**
 * CashFlowScene — 3D animated cash flow visualization
 * Floating dollar signs, invoice cards, and flowing particles
 * representing money movement / cash flow problems
 */

import { useRef, useEffect } from 'react'
import * as THREE from 'three'

export function CashFlowScene({ className = '' }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const currentMount = mountRef.current
    if (!currentMount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      60,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      1000
    )
    camera.position.z = 6

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    currentMount.appendChild(renderer.domElement)

    // --- Particle system representing cash flow ---
    const particleCount = 300
    const particlesGeometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const velocities = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)

    const emerald = new THREE.Color(0x10b981)
    const amber = new THREE.Color(0xf59e0b)
    const red = new THREE.Color(0xef4444)

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3
      positions[i3] = (Math.random() - 0.5) * 14
      positions[i3 + 1] = (Math.random() - 0.5) * 10
      positions[i3 + 2] = (Math.random() - 0.5) * 8

      velocities[i3] = (Math.random() - 0.5) * 0.01
      velocities[i3 + 1] = -0.005 - Math.random() * 0.015 // falling down = money draining
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.005

      // Mix of colors: green (flowing), amber (pending), red (overdue)
      const colorChoice = Math.random()
      const color = colorChoice < 0.4 ? emerald : colorChoice < 0.7 ? amber : red
      colors[i3] = color.r
      colors[i3 + 1] = color.g
      colors[i3 + 2] = color.b
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    })

    const particles = new THREE.Points(particlesGeometry, particleMaterial)
    scene.add(particles)

    // --- Floating invoice rectangles ---
    const invoices: THREE.Mesh[] = []
    const invoiceGroup = new THREE.Group()

    for (let i = 0; i < 8; i++) {
      const width = 0.6 + Math.random() * 0.8
      const height = 0.8 + Math.random() * 0.6
      const geometry = new THREE.PlaneGeometry(width, height)

      const isOverdue = Math.random() > 0.5
      const material = new THREE.MeshPhongMaterial({
        color: isOverdue ? 0xef4444 : 0x10b981,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        emissive: isOverdue ? 0xef4444 : 0x10b981,
        emissiveIntensity: 0.15,
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 4
      )
      mesh.rotation.set(
        Math.random() * Math.PI * 0.3,
        Math.random() * Math.PI * 0.3,
        Math.random() * Math.PI * 0.1
      )
      mesh.userData = {
        speed: 0.002 + Math.random() * 0.005,
        rotSpeed: 0.001 + Math.random() * 0.003,
        floatOffset: Math.random() * Math.PI * 2,
      }

      invoices.push(mesh)
      invoiceGroup.add(mesh)
    }
    scene.add(invoiceGroup)

    // --- Dollar sign geometries floating ---
    const dollarGroup = new THREE.Group()
    for (let i = 0; i < 5; i++) {
      const torusGeo = new THREE.TorusGeometry(0.3, 0.06, 8, 24)
      const mat = new THREE.MeshPhongMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.2,
        emissive: 0x10b981,
        emissiveIntensity: 0.3,
      })
      const torus = new THREE.Mesh(torusGeo, mat)
      torus.position.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 4
      )
      torus.userData = {
        speed: 0.003 + Math.random() * 0.005,
        offset: Math.random() * Math.PI * 2,
      }
      dollarGroup.add(torus)
    }
    scene.add(dollarGroup)

    // --- Flow lines (representing money streams) ---
    const flowLines: THREE.Line[] = []
    for (let i = 0; i < 6; i++) {
      const points: THREE.Vector3[] = []
      const startX = (Math.random() - 0.5) * 8
      const startY = 5 + Math.random() * 2
      for (let j = 0; j < 20; j++) {
        points.push(new THREE.Vector3(
          startX + Math.sin(j * 0.5) * 1.5,
          startY - j * 0.5,
          (Math.random() - 0.5) * 2
        ))
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points)
      const lineMat = new THREE.LineBasicMaterial({
        color: i < 3 ? 0x10b981 : 0xef4444,
        transparent: true,
        opacity: 0.15,
      })
      const line = new THREE.Line(lineGeo, lineMat)
      line.userData = { offset: Math.random() * Math.PI * 2 }
      flowLines.push(line)
      scene.add(line)
    }

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    scene.add(ambientLight)

    const pointLight1 = new THREE.PointLight(0x10b981, 2, 20)
    pointLight1.position.set(5, 5, 5)
    scene.add(pointLight1)

    const pointLight2 = new THREE.PointLight(0xef4444, 1.5, 20)
    pointLight2.position.set(-5, -3, 3)
    scene.add(pointLight2)

    // --- Mouse interaction ---
    const mouse = { x: 0, y: 0 }
    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener('mousemove', handleMouseMove)

    // --- Animation loop ---
    let time = 0
    const animate = () => {
      time += 0.01

      // Animate particles (falling = cash draining)
      const posArr = particlesGeometry.attributes.position.array as Float32Array
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3
        posArr[i3] += velocities[i3]
        posArr[i3 + 1] += velocities[i3 + 1]
        posArr[i3 + 2] += velocities[i3 + 2]

        // Reset particles that fall below
        if (posArr[i3 + 1] < -5) {
          posArr[i3] = (Math.random() - 0.5) * 14
          posArr[i3 + 1] = 5 + Math.random() * 2
          posArr[i3 + 2] = (Math.random() - 0.5) * 8
        }
      }
      particlesGeometry.attributes.position.needsUpdate = true

      // Animate invoices
      invoices.forEach((inv) => {
        const d = inv.userData
        inv.position.y += Math.sin(time * 2 + d.floatOffset) * 0.003
        inv.rotation.y += d.rotSpeed
        inv.rotation.x += d.rotSpeed * 0.5
      })

      // Animate dollar signs
      dollarGroup.children.forEach((child) => {
        const d = child.userData
        child.rotation.y += d.speed
        child.rotation.x = Math.sin(time + d.offset) * 0.3
        child.position.y += Math.sin(time * 1.5 + d.offset) * 0.003
      })

      // Animate flow lines
      flowLines.forEach((line) => {
        line.position.y = Math.sin(time + line.userData.offset) * 0.3
      })

      // Mouse reactivity
      camera.position.x += (mouse.x * 0.5 - camera.position.x) * 0.02
      camera.position.y += (mouse.y * 0.3 - camera.position.y) * 0.02
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
      requestAnimationFrame(animate)
    }

    animate()

    // Resize
    const handleResize = () => {
      if (!currentMount) return
      camera.aspect = currentMount.clientWidth / currentMount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      if (currentMount && renderer.domElement.parentNode === currentMount) {
        currentMount.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [])

  return <div ref={mountRef} className={`w-full h-full ${className}`} />
}
