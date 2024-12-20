export const SkeletonLoader = ({ isDarkTheme }: { isDarkTheme: boolean }) => {
	return (
		<div
			className={`${
				isDarkTheme ? "bg-code-dark" : "bg-code-light"
			} rounded-lg overflow-hidden shadow-lg animate-pulse w-full`}
		>
			<div className="h-10 bg-stone-400 rounded w-full"></div>
		</div>
	);
};
