import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Stockyard Animal Health — Florida Veterinary Telemedicine",
    template: "%s | Stockyard Animal Health",
  },
  description:
    "Expert veterinary care for your farm animals and companions, right from your home. Video consultations with Dr. Meleah McMillen – Florida's trusted rural veterinarian. $60 flat rate, 7 days a week.",
  keywords:
    "veterinary telemedicine Florida, farm animal vet online, horse vet Florida, cattle vet telemedicine, large animal vet consultation, rural veterinarian Florida, livestock vet online, equine telemedicine, online vet consultation, telemedicine vet",
  metadataBase: new URL("https://stockyardanimalhealth.com"),
  alternates: { canonical: "https://stockyardanimalhealth.com/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  openGraph: {
    type: "website",
    url: "https://stockyardanimalhealth.com/",
    siteName: "Stockyard Animal Health",
    title: "Stockyard Animal Health — Florida Veterinary Telemedicine",
    description:
      "Video consultations with Dr. Meleah McMillen, Florida's trusted rural veterinarian. Expert care for horses, cattle, goats, chickens, dogs, cats & more. $60 flat rate. 7 days a week.",
    images: [
      {
        url: "https://stockyardanimalhealth.com/New logo.png",
        width: 1200,
        height: 630,
        alt: "Stockyard Animal Health — Florida Veterinary Telemedicine",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stockyard Animal Health — Florida Veterinary Telemedicine",
    description:
      "Video consultations with Dr. Meleah McMillen for farm animals & companions. $60 flat rate. Available 7 days a week across Florida.",
    images: ["https://stockyardanimalhealth.com/New logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "VeterinaryCare",
                  "@id": "https://stockyardanimalhealth.com/#organization",
                  name: "Stockyard Animal Health",
                  url: "https://stockyardanimalhealth.com",
                  logo: "https://stockyardanimalhealth.com/favicon.svg",
                  description: "Florida veterinary telemedicine — expert video consultations for farm animals and companions with Dr. Meleah McMillen.",
                  areaServed: { "@type": "State", name: "Florida" },
                  serviceType: "Veterinary Telemedicine",
                  priceRange: "$60",
                  openingHours: "Mo-Su 00:00-23:59",
                  telephone: "",
                  sameAs: [],
                },
                {
                  "@type": "Physician",
                  "@id": "https://stockyardanimalhealth.com/#doctor",
                  name: "Dr. Meleah McMillen",
                  jobTitle: "Veterinarian",
                  description: "Licensed Florida veterinarian specializing in farm animals and rural companions via telemedicine.",
                  worksFor: { "@id": "https://stockyardanimalhealth.com/#organization" },
                  image: "https://stockyardanimalhealth.com/dr-mcmillen.jpg",
                  url: "https://stockyardanimalhealth.com/about",
                },
                {
                  "@type": "Service",
                  "@id": "https://stockyardanimalhealth.com/#service",
                  name: "Veterinary Video Consultation",
                  provider: { "@id": "https://stockyardanimalhealth.com/#organization" },
                  description: "Live video consultation with a licensed Florida veterinarian for horses, cattle, goats, sheep, pigs, chickens, dogs, cats, and more.",
                  offers: {
                    "@type": "Offer",
                    price: "60.00",
                    priceCurrency: "USD",
                    availability: "https://schema.org/InStock",
                  },
                  areaServed: { "@type": "State", name: "Florida" },
                },
                {
                  "@type": "WebSite",
                  "@id": "https://stockyardanimalhealth.com/#website",
                  url: "https://stockyardanimalhealth.com",
                  name: "Stockyard Animal Health",
                  publisher: { "@id": "https://stockyardanimalhealth.com/#organization" },
                  potentialAction: {
                    "@type": "SearchAction",
                    target: "https://stockyardanimalhealth.com/?q={search_term_string}",
                    "query-input": "required name=search_term_string",
                  },
                },
              ],
            }),
          }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
