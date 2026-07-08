import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { HeroSection } from '../components/marketing/HeroSection';
import { ProblemSection } from '../components/marketing/ProblemSection';
import { LiveWorkflowSimulation } from '../components/marketing/LiveWorkflowSimulation';
import { UseCaseCards } from '../components/marketing/UseCaseCards';
import { BeforeAfterSection } from '../components/marketing/BeforeAfterSection';
import { ExceptionEscalation } from '../components/marketing/ExceptionEscalation';
import { PricingOptionsSection } from '../components/marketing/PricingOptionsSection';
import { ImplementationRoadmap } from '../components/marketing/ImplementationRoadmap';
import { CallToActionSection } from '../components/marketing/CallToActionSection';

export function MarketingHomePage() {
  return (
    <MarketingLayout>
      <HeroSection />
      <ProblemSection />
      <LiveWorkflowSimulation />
      <UseCaseCards />
      <BeforeAfterSection />
      <ExceptionEscalation />
      <PricingOptionsSection />
      <ImplementationRoadmap />
      <CallToActionSection />
    </MarketingLayout>
  );
}
