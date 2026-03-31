import AppLogoIcon from '@/components/app-logo-icon';

export default function AppLogo() {
    return (
        <>
            
            <AppLogoIcon className="size-10 rounded-lg" />

            <div className="ml-1 grid flex-1 text-left text-2xl">
                <span className="mb-0.5 truncate font-extrabold">
                    UnfaceAI
                </span>
            </div>
        </>
    );
}
