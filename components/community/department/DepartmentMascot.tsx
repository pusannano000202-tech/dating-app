import Image from 'next/image'
import { Activity, Atom, BookOpen, Brain, BriefcaseBusiness, Building2, CarFront, ChartNoAxesCombined, Clapperboard, CloudSun, CodeXml, Cog, Compass, Cpu, Dna, DraftingCompass, FlaskConical, Gem, Globe2, GraduationCap, HeartHandshake, Landmark, Languages, Mountain, Music2, Network, Palette, PawPrint, Pill, Rocket, Scale, Ship, Shirt, Sigma, Sprout, Stethoscope, Utensils, Zap, type LucideIcon } from 'lucide-react'
import { departmentMascot } from '@/lib/meetups/department-mascots'
import s from './department-mascot.module.css'

const symbols: Record<string,LucideIcon>={Activity,Atom,BookOpen,Brain,BriefcaseBusiness,Building2,CarFront,ChartNoAxesCombined,Clapperboard,CloudSun,CodeXml,Cog,Compass,Cpu,Dna,DraftingCompass,FlaskConical,Gem,Globe2,GraduationCap,HeartHandshake,Landmark,Languages,Mountain,Music2,Network,Palette,PawPrint,Pill,Rocket,Scale,Ship,Shirt,Sigma,Sprout,Stethoscope,Utensils,Zap}
export default function DepartmentMascot({department,size=48,className=''}:{department:string;size?:number;className?:string}) {
  const identity=departmentMascot(department),Icon=symbols[identity.icon]??GraduationCap
  return <span className={`${s.mascot} ${className}`} style={{width:size,height:size}} data-department-mascot={department}>
    {identity.image?<Image src={identity.image} alt={identity.label} width={size} height={size} sizes={`${size}px`} unoptimized/>:<span className={s.symbol} role="img" aria-label={identity.label}><Icon size={Math.round(size*.52)} strokeWidth={1.6} aria-hidden="true"/></span>}
  </span>
}
