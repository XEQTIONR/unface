import { Head } from '@inertiajs/react';
import { ArrowRight } from 'lucide-react';
import { ComparisonSlider } from '@/components/comparison-slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { PlaceholderPattern } from '@/components/ui/placeholder-pattern';
import { Separator } from '@/components/ui/separator';

export default function Welcome() {
    return (
        <>
            <Head title="Welcome" />
            <div className="flex h-full flex-1 flex-col overflow-x-auto rounded-xl p-4 mt-20">
                <div className="w-full md:max-w-7xl px-4 mx-auto flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row gap-4 md:grid-cols-3">
                        <div className="w-full md:w-1/2 relative overflow-hidden">
                            <h1 className="text-6xl font-black tracking-tighter mb-10">
                                AI-Powered <br /> Video Face Tracking <br /> and Removal
                            </h1>
                            <p className="text-xl text-muted-foreground leading-7">
                                Transform your video edits with dynamic face removal and sticker overlay.
                                Secure your privacy and enhance your content in seconds.
                            </p>
                            <div className='flex gap-2 mt-8'>
                                <Button className="font-bold rounded-full p-5" size="lg" variant="default">
                                    Get Started
                                    <ArrowRight />
                                </Button>
                            </div>
                        </div>
                        <div className="w-full md:w-1/2 relative aspect-video overflow-hidden rounded-xl border border-sidebar-border/70 dark:border-sidebar-border">
                            <PlaceholderPattern className="absolute inset-0 size-full stroke-neutral-900/20 dark:stroke-neutral-100/20" />
                        </div>
                    </div>
                    <div className="relative md:w-3/5 overflow-hidden rounded-xl md:min-h-min mt-30">
                        <h2 className="text-4xl tracking-tight font-black mb-4">Designed to be quick and easy</h2>
                        <p className="text-muted-foreground">
                            Our neural engine handles the heavy lifting, so you can focus on the creative vision.
                            One-click solutions for complex masking tasks.
                        </p>
                    </div>
                    <div className="w-full grid grid-cols-3 gap-3 mt-10">
                        <div className="col-span-2 bg-neutral-900 min-h-36"></div>
                        <div className="col-span-1 bg-neutral-900 min-h-36"></div>
                        <div className="col-span-1 bg-neutral-900 min-h-36"></div>
                        <div className="col-span-2 bg-neutral-900 min-h-36"></div>
                    </div>
                    <div className="relative md:w-3/5 overflow-hidden rounded-xl md:min-h-min mt-30">
                        <h2 className="text-4xl tracking-tight font-black mb-4">Redact faces of individuals in videos</h2>
                        <p className="text-muted-foreground">
                            Our neural engine handles the heavy lifting, so you can focus on the creative vision.
                            One-click solutions for complex masking tasks.
                        </p>
                    </div>
                </div>
                <Separator className="my-30" />
                <div className="w-full md:max-w-7xl px-4 mx-auto flex flex-col gap-4">
                    <h2 className="text-4xl tracking-tight font-black mb-4 text-center">Three steps to magic</h2>
                    <p className="text-muted-foreground text-center">Upload, Select, Export. It's that simple.</p>
                    <div className="w-full md:max-w-7xl flex items-center">
                        <div className="w-1/5">
                            <Separator />
                        </div>
                        <div className="size-24 text-lg font-extrabold flex justify-center items-center bg-neutral-900 shrink-0">
                            01
                        </div>
                        <div className="w-1/5">
                            <Separator />
                        </div>
                        <div className="size-24 text-lg font-extrabold flex justify-center items-center bg-neutral-900 shrink-0">
                            02
                        </div>
                        <div className="w-1/5">
                            <Separator />
                        </div>
                        <div className="size-24 text-lg font-extrabold flex justify-center items-center bg-neutral-900 shrink-0">
                            03
                        </div>
                        <div className="w-1/5">
                            <Separator />
                        </div>
                    </div>
                    <div className='w-full md:max-w-7xl flex justify-around gap-4'>
                        <div className='w-1/3 flex justify-end'>
                            <div className='text-center w-1/2 relative -left-1/25'>
                                <h3 className="text-lg font-bold mb-2">Upload footage</h3>
                                <p className="text-sm text-muted-foreground">
                                    Drag and drop. All major formats supported.
                                </p>
                            </div>
                        </div>
                        <div className='w-1/3 flex justify-center'>
                            <div className='text-center w-1/2'>
                                <h3 className="text-lg font-bold mb-2">Select task</h3>
                                <p className="text-sm text-muted-foreground">
                                    Choose between face removal and sticker application.
                                </p>
                            </div>
                        </div>
                        <div className='w-1/3 flex justify-start'>
                            <div className='text-center w-1/2 relative -right-1/25'>
                                <h3 className="text-lg font-bold mb-2">AI Process</h3>
                                <p className="text-sm text-muted-foreground">
                                    Our servers render your request in the cloud.
                                    Download on finish.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className='w-full'>
                    <div className='border-4 border-amber-300 flex justify-center items-center'>
                        <ComparisonSlider />
                    </div>
                </div>
                
                <Separator className="my-30" />
                <div className="w-full md:max-w-7xl px-4 mx-auto flex flex-col gap-4">
                    <h2 className="text-4xl tracking-tight font-black mb-4 text-center">Frequently Asked Questions</h2>
                    <Accordion
                        type="single"
                        collapsible
                        className="w-full max-w-4xl mx-auto bg-neutral-900/50 px-5"
                    >
                    {[
                        {
                            value: "notifications",
                            trigger: "Notification Settings",
                            content:
                            "Manage how you receive notifications. You can enable email alerts for updates or push notifications for mobile devices.",
                        },
                        {
                            value: "privacy",
                            trigger: "Privacy & Security",
                            content:
                            "Control your privacy settings and security preferences. Enable two-factor authentication, manage connected devices, review active sessions, and configure data sharing preferences. You can also download your data or delete your account.",
                        },
                        {
                            value: "billing",
                            trigger: "Billing & Subscription",
                            content:
                            "View your current plan, payment history, and upcoming invoices. Update your payment method, change your subscription tier, or cancel your subscription.",
                        },
                        ].map((item) => (
                            <AccordionItem className='b-20' key={item.value} value={item.value}>
                                <AccordionTrigger className='text-lg font-semibold text-foreground'>{item.trigger}</AccordionTrigger>
                                <AccordionContent className='text-base text-muted-foreground pb-4 pt-2'>{item.content}</AccordionContent>
                            </AccordionItem>
                        ))
                    }
                    </Accordion>

                    <div className='w-full aspect-video my-20 md:max-w-7xl flex flex-col gap-10 justify-center items-center bg-neutral-900/50 p-5 rounded-xl'>
                        <h3 className='text-5xl font-black mb-2 text-center tracking-tighter leading-14'>
                            Ready to revolutionize your <br /> video workflow?
                        </h3>
                        <Button className="font-bold text-lg rounded-full px-10 py-8" size="lg" variant="default">
                            Get Started Now
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}

Welcome.layout = {
    breadcrumbs: [
        {
            title: 'Welcome',
            href: '/',
        },
    ],
};
