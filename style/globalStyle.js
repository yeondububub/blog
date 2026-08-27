// menu style
const menuListStyle = `md:ml-10 text-base leading-snug text-surface dark:text-gray-200 hover:text-graylv3 dark:hover:text-white font-medium`;

// mobile menu style
const mobileMenuStyle = `m-0 block py-4 px-6 dark:text-gray-200`;

// blog style과 notebook style
const posth1Style = `text-[40px] font-bold mb-4 mt-6 border-b border-graylv2 dark:border-gray-700 dark:text-white pb-2.5 break-keep`;
const posth2Style = `text-[32px] font-bold mb-4 mt-6 border-b border-graylv2 dark:border-gray-700 dark:text-white pb-2.5 break-keep`;
const posth3Style = `text-[28px] font-bold mb-4 mt-6 border-b border-graylv2 dark:border-gray-700 dark:text-white pb-2.5 break-keep`;
const posth4Style = `text-2xl font-bold mb-2 mt-4 dark:text-white break-keep`;
const posth5Style = `text-xl font-bold mb-2 mt-4 dark:text-white break-keep`;
const posth6Style = `text-lg font-bold mb-2 mt-4 dark:text-white break-keep`;

const postpStyle = `text-lg my-6 font-normal tracking-wide text-left dark:text-gray-300 break-keep`;
const postimgStyle = `border-4 border-graylv1 dark:border-gray-800 rounded my-10 mx-auto block max-w-full h-auto align-middle`;
const postaStyle = `text-lg text-primary underline hover:bg-activation dark:hover:bg-blue-900/50 transition duration-200`;

const postulStyle = `list-disc list-inside text-lg font-normal tracking-wide text-left dark:text-gray-300 break-keep`;
const postolStyle = `list-decimal list-inside text-lg font-normal tracking-wide text-left dark:text-gray-300 break-keep`;
const postliStyle = `pl-4 mb-2 leading-relaxed tracking-wide text-left dark:text-gray-300 break-keep`;

const postblockquoteStyle = `border-l-4 border-primary pl-4 dark:text-gray-300 break-keep`;
const postpreStyle = `relative bg-graylv1 dark:bg-[#1a1b1e] dark:text-gray-200 p-4 rounded-[10px] mb-6 text-base font-medium overflow-x-auto whitespace-pre text-left max-w-full h-auto align-middle`;
const postcodeStyle = `font-mono text-base bg-transparent whitespace-pre`;

const posttableStyle = `table-auto w-auto border-collapse mb-6 h-auto align-middle border-graylv2 dark:border-gray-700 text-left`;
const posttheadStyle = `text-left`;
const postthStyle = `overflow-auto bg-graylv1 dark:bg-[#252830] border border-graylv2 dark:border-gray-700 dark:text-gray-200 px-4 py-2.5 font-medium text-sm capitalize whitespace-nowrap`;
const posttbodyStyle = `text-left`;
const posttdStyle = `border border-graylv2 dark:border-gray-700 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 break-keep`;

const posthrStyle = `my-4 border-gray-400 dark:border-gray-600 border-2 rounded-lg`;
const postemStyle = `text-lg font-medium italic pr-0.5 dark:text-gray-200`;
const poststrongStyle = `text-lg font-bold dark:text-white`;

// blog에 최상단 제목과 이미지 날짜 카테고리를 표시하는 부분
const postcategoryStyle = `bg-activation dark:bg-blue-900/60 text-primary dark:text-blue-300 text-sm font-medium px-3 py-1.5 rounded-lg tracking-wide transition duration-200 ease-in-out hover:bg-blue-400 hover:text-white`;
const posttitleStyle = `md:text-[40px] md:leading-[56px] text-[32px] leading-[40px] font-bold my-3 dark:text-white break-keep`;

const postauthordateDivStyle = `md:mb-8 mb-6 h-fit`;
const postauthorDivStyle = `inline-block`;
const postauthorImgStyle = `inline w-8 h-8 rounded-full object-cover object-center mr-2 border border-graylv2 dark:border-gray-700 overflow-hidden`;
const postauthorStyle = `inline text-sm font-semibold text-black dark:text-gray-200 mr-2`;
const postdateStyle = `inline-block text-graylv3 dark:text-gray-400 text-sm font-normal`;
const postimgtitleStyle = `w-full max-h-[520px] object-cover object-center my-4 rounded-2xl mx-auto block max-w-full align-middle`;
const postsectionStyle = `w-full mb-10 md:mb-[60px] max-w-full h-auto align-middle`;

// notebook에 code cell을 표시하는 부분
const notebookpreStyle = `relative bg-graylv1 dark:bg-[#1a1b1e] dark:text-gray-200 p-8 rounded-[10px] mb-6 text-base font-medium overflow-x-auto whitespace-pre text-left max-w-full h-auto align-middle`;
const notebookcodeStyle = `font-mono text-base bg-transparent whitespace-pre`;
const notebookcopyButtonStyle = `border border-lv2 copy-button bg-white dark:bg-gray-800 dark:border-gray-700 rounded-[10px] opacity-70 absolute top-5 right-5 p-2 shadow-md`;
const notebookdownloadButtonStyle = `download-button px-5 py-[11px] mb-4 text-sm font-medium text-white bg-primary rounded-[10px] hover:bg-primary`;

// bloglist 목록 스타일
const bloglistFirstCardStyle = `lg:col-span-3 md:col-span-2 col-span-1 h-auto rounded overflow-hidden bg-white dark:bg-[#18191c] transition duration-200 ease-in-out transform hover:-translate-y-1 hover:scale-105 flex md:flex-row flex-col flex-1 md:mb-[20px] cursor-pointer`;
const bloglistFirstCardImgStyle = `w-full object-cover object-center rounded-2xl overflow-hidden md:h-auto h-[200px] md:w-[49%] lg:w-[52%] shrink-0 mr-8`;
const bloglistFirstCardDescriptionStyle = `text-graylv4 dark:text-gray-300 text-base font-normal leading-snug md:max-h-40 md:line-clamp-[7] line-clamp-3 mb-3 break-keep`;

const bloglistCardStyle = `lg:max-w-sm overflow-hidden bg-white dark:bg-[#18191c] transition duration-200 ease-in-out transform hover:-translate-y-1 hover:scale-105 cursor-poitner col-span-1 w-auto cursor-pointer`;
const bloglistCardImgStyle = `w-full h-[200px] object-cover object-center rounded-2xl overflow-hidden`;

const bloglistCardBodyStyle = `py-4`;
const bloglistCardTitleStyle = `font-bold text-2xl mb-3 dark:text-white break-keep`;
const bloglistCardCategoryStyle = `inline-block bg-activation dark:bg-blue-900/60 text-primary dark:text-blue-300 md:text-sm font-medium mb-3 px-3 py-1.5 rounded-lg transition duration-200 ease-in-out hover:bg-blue-400 hover:text-white`;
const bloglistCardDescriptionStyle = `text-graylv4 dark:text-gray-400 text-base font-normal leading-snug h-16 line-clamp-3 mb-3 break-keep`;
const bloglistCardAuthorDivStyle = `inline-block`;
const bloglistCardAuthorImgStyle = `inline w-8 h-8 rounded-full object-cover object-center mr-2 border border-graylv2 dark:border-gray-700 overflow-hidden`;
const bloglistCardAuthorStyle = `inline text-sm font-semibold text-black dark:text-gray-200 mr-2`;
const bloglistCardDateStyle = `text-graylv3 dark:text-gray-400 text-sm inline-block font-normal`;

// 검색창 스타일
const searchInputStyle = `absolute top-20 right-8 w-[220px] h-10 rounded-md border border-gray-300 dark:border-gray-700 pl-2 text-base font-bold text-gray-600 dark:text-gray-200 outline-none box-border transition duration-300 ease-in-out shadow-none bg-white dark:bg-[#18191c] bg-clip-padding`;

// category 스타일
const categoryContainerStyle = `hidden flex-col md:w-[220px] overflow-y-auto rounded-md bg-white dark:bg-[#18191c] shadow-sm z-10`;
const categoryItemStyle = `text-base font-normal px-5 py-[9px] cursor-pointer hover:bg-graylv1 dark:hover:bg-gray-800 dark:text-gray-200 transition duration-200 ease-in-out`;
const categoryItemCountStyle = `text-base font-normal text-graylv3 dark:text-gray-400 ml-1`;

// paginationStyle
const paginationStyle = `mt-20 mb-[132px] flex justify-center items-center gap-8`;
const pageMoveButtonStyle = `relative flex inline-flex items-center rounded-[10px] p-[11px] text-graylv2 dark:text-gray-400 hover:text-graylv4 dark:hover:text-gray-200 bg-graylv1 dark:bg-gray-800`;
const pageNumberListStyle = `flex items-center justify-center gap-1`;
const pageNumberStyle = `relative inline-flex items-center w-10 h-10 px-4 py-2 text-md font-normal text-graylv3 dark:text-gray-400`;
const pageNumberActiveStyle = `text-primary dark:text-blue-400 font-bold`;

// toc (Table of Contents) 목차 스타일
const tocContainerStyle = `hidden flex-col md:w-[260px] max-h-[70vh] overflow-y-auto rounded-md bg-white dark:bg-[#18191c] shadow-sm z-10 py-2 px-1 text-sm`;
const tocItemBaseStyle = `block text-left px-3.5 py-1.5 text-[13px] leading-snug transition-all duration-150 cursor-pointer text-graylv4 dark:text-gray-300 hover:text-primary dark:hover:text-blue-400 hover:bg-graylv1 dark:hover:bg-gray-800/70 rounded-[6px] truncate`;
const tocItemActiveStyle = `text-primary dark:text-blue-400 font-semibold bg-blue-50/80 dark:bg-blue-950/50 border-l-[3px] border-primary dark:border-blue-400 pl-2.5`;

