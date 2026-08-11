/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(243 75% 59%)',
  				'2': 'hsl(200 80% 55%)',
  				'3': 'hsl(25 95% 53%)',
  				'4': 'hsl(280 65% 60%)',
  				'5': 'hsl(340 75% 55%)'
  			}
  		},
  		fontFamily: {
  			heading: ['var(--font-heading)'],
  			body: ['var(--font-body)'],
  			display: ['var(--font-display)'],
  			mono: ['var(--font-mono)']
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			},
  			'fade-in': {
  				from: { opacity: '0', transform: 'translateY(4px)' },
  				to: { opacity: '1', transform: 'translateY(0)' }
  			},
  			'slide-up': {
			from: { opacity: '0', transform: 'translateY(8px)' },
			to: { opacity: '1', transform: 'translateY(0)' }
		},
		'pop-in': {
			'0%': { opacity: '0', transform: 'scale(0.85)' },
			'60%': { transform: 'scale(1.03)' },
			'100%': { opacity: '1', transform: 'scale(1)' }
		},
		'pulse-glow': {
  				'0%, 100%': { boxShadow: '0 0 8px -2px hsl(158 84% 52% / 0.2)' },
  				'50%': { boxShadow: '0 0 20px -2px hsl(158 84% 52% / 0.4)' }
  			},
  			'slide-in-right': {
  				from: { opacity: '0', transform: 'translateX(12px)' },
  				to: { opacity: '1', transform: 'translateX(0)' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.3s ease-out',
  			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
		'slide-up': 'slide-up 0.25s ease-out both',
		'pop-in': 'pop-in 0.3s ease-out both',
  			'slide-in-right': 'slide-in-right 0.3s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
